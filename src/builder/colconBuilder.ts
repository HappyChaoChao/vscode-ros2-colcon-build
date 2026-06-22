import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { Ros2Package, BuildOptions, BuildResult, DockerBuildOptions } from '../types';
import { OutputParser, BuildEvent } from './outputParser';
import { OutputChannelManager } from '../ui/outputChannel';
import { Settings } from '../config/settings';
import { Logger } from '../utils/logger';

export class ColconBuilder {
    private outputChannel: OutputChannelManager;
    private outputParser: OutputParser;
    private settings: Settings;
    private currentProcess: ChildProcess | null = null;
    private isBuilding: boolean = false;
    private isCancelled: boolean = false;
    private onProgressCallback: ((progress: { current: number; total: number; packageName: string | null }) => void) | null = null;
    private logger: Logger;

    constructor(
        outputChannel: OutputChannelManager,
        outputParser: OutputParser,
        settings: Settings
    ) {
        this.outputChannel = outputChannel;
        this.outputParser = outputParser;
        this.settings = settings;
        this.logger = Logger.getInstance();

        // Listen to parser events
        this.outputParser.on('event', (event: BuildEvent) => {
            this.handleBuildEvent(event);
        });
    }

    setOnProgressCallback(callback: (progress: { current: number; total: number; packageName: string | null }) => void): void {
        this.onProgressCallback = callback;
    }

    async build(packages: Ros2Package[]): Promise<BuildResult> {
        if (this.isBuilding) {
            this.logger.warn('Build already in progress');
            vscode.window.showWarningMessage('Build already in progress');
            return this.createEmptyResult();
        }

        this.logger.info(`Preparing to build ${packages.length} packages`);

        const options: BuildOptions = {
            packages: packages,
            buildType: this.settings.getDefaultBuildType(),
            parallelWorkers: this.settings.getDefaultParallelWorkers(),
            symlinkInstall: this.settings.getDefaultSymlinkInstall(),
            continueOnError: this.settings.getDefaultContinueOnError(),
            extraArgs: this.settings.getColconArgs()
        };

        this.logger.info(`Build options: type=${options.buildType}, workers=${options.parallelWorkers}, symlink=${options.symlinkInstall}`);

        return this.executeBuild(options);
    }

    async buildWithOptions(options: BuildOptions): Promise<BuildResult> {
        if (this.isBuilding) {
            vscode.window.showWarningMessage('Build already in progress');
            return this.createEmptyResult();
        }
        return this.executeBuild(options);
    }

    async buildDocker(packages: Ros2Package[]): Promise<BuildResult> {
        if (this.isBuilding) {
            vscode.window.showWarningMessage('Build already in progress');
            return this.createEmptyResult();
        }

        const options: DockerBuildOptions = {
            packages: packages,
            buildType: this.settings.getDefaultBuildType(),
            parallelWorkers: this.settings.getDefaultParallelWorkers(),
            symlinkInstall: this.settings.getDefaultSymlinkInstall(),
            continueOnError: this.settings.getDefaultContinueOnError(),
            extraArgs: this.settings.getColconArgs(),
            builderName: this.settings.getDockerBuilderName(),
            platform: this.settings.getDockerPlatform()
        };

        return this.executeDockerBuild(options);
    }

    private async executeBuild(options: BuildOptions): Promise<BuildResult> {
        this.isBuilding = true;
        this.isCancelled = false;
        this.outputParser.reset();
        this.outputParser.setTotalPackages(options.packages.length);
        this.outputChannel.clear();
        this.outputChannel.show();

        const startTime = Date.now();
        const packageNames = options.packages.map(p => p.name);

        this.logger.info(`Executing build for packages: ${packageNames.join(', ')}`);
        this.logger.info(`Build type: ${options.buildType}, Workers: ${options.parallelWorkers}`);

        // Build colcon command
        const args = [
            'build',
            '--packages-select', ...packageNames,
            '--cmake-args', `-DCMAKE_BUILD_TYPE=${options.buildType}`,
            '--parallel-workers', options.parallelWorkers.toString(),
            '--event-handlers', 'console_cohesion+'
        ];

        if (options.symlinkInstall) {
            args.push('--symlink-install');
        }

        if (options.continueOnError) {
            args.push('--continue-on-error');
        }

        args.push(...options.extraArgs);

        this.outputChannel.appendLine(`[Build] Starting colcon build for ${packageNames.length} packages...`);
        this.outputChannel.appendLine(`[Build] Command: colcon ${args.join(' ')}`);
        this.outputChannel.appendLine('');

        try {
            await this.spawnColcon(args);
        } catch (error) {
            this.outputChannel.appendLine(`[Build Error] ${error}`);
        }

        const duration = Date.now() - startTime;
        const result: BuildResult = {
            success: this.outputParser.getTotalErrors() === 0,
            packages: this.outputParser.getResults(),
            totalErrors: this.outputParser.getTotalErrors(),
            totalWarnings: this.outputParser.getTotalWarnings(),
            duration: duration,
            timestamp: Date.now()
        };

        this.isBuilding = false;
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine(`[Build] Completed in ${(duration / 1000).toFixed(1)}s`);
        this.outputChannel.appendLine(`[Build] ${result.totalErrors} errors, ${result.totalWarnings} warnings`);

        return result;
    }

    private async executeDockerBuild(options: DockerBuildOptions): Promise<BuildResult> {
        this.isBuilding = true;
        this.isCancelled = false;
        this.outputParser.reset();
        this.outputChannel.clear();
        this.outputChannel.show();

        const startTime = Date.now();
        const packageNames = options.packages.map(p => p.name);

        // Build docker command
        const args = [
            'buildx', 'build',
            '--platform', options.platform,
            '--builder', options.builderName,
            '--build-arg', `BUILD_PACKAGES=${packageNames.join(' ')}`,
            '--build-arg', `BUILD_TYPE=${options.buildType}`,
            '--build-arg', `PARALLEL_WORKERS=${options.parallelWorkers}`,
            '--target', 'export',
            '--output', 'type=local,dest=./dist',
            '.'
        ];

        this.outputChannel.appendLine(`[Docker Build] Starting docker buildx for ${packageNames.length} packages...`);
        this.outputChannel.appendLine(`[Docker Build] Command: docker ${args.join(' ')}`);
        this.outputChannel.appendLine('');

        try {
            await this.spawnDocker(args);
        } catch (error) {
            this.outputChannel.appendLine(`[Docker Build Error] ${error}`);
        }

        const duration = Date.now() - startTime;
        const result: BuildResult = {
            success: this.outputParser.getTotalErrors() === 0,
            packages: this.outputParser.getResults(),
            totalErrors: this.outputParser.getTotalErrors(),
            totalWarnings: this.outputParser.getTotalWarnings(),
            duration: duration,
            timestamp: Date.now()
        };

        this.isBuilding = false;
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine(`[Docker Build] Completed in ${(duration / 1000).toFixed(1)}s`);

        return result;
    }

    async clean(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return;
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        this.outputChannel.show();
        this.outputChannel.appendLine('[Clean] Removing build, install, and log directories...');

        try {
            await this.spawnCommand('rm', ['-rf', 'build', 'install', 'log'], workspaceRoot);
            this.outputChannel.appendLine('[Clean] Clean completed');
        } catch (error) {
            this.outputChannel.appendLine(`[Clean Error] ${error}`);
        }
    }

    private spawnColcon(args: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                const error = new Error('No workspace folder open');
                this.logger.error('Failed to spawn colcon', error);
                reject(error);
                return;
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;

            // Source ROS2 setup and run colcon
            const shell = process.platform === 'win32' ? 'cmd' : '/bin/bash';
            const shellArgs = process.platform === 'win32'
                ? ['/c', `colcon ${args.join(' ')}`]
                : ['-c', `source /opt/ros/humble/setup.bash && colcon ${args.join(' ')}`];

            this.logger.info(`Spawning colcon: ${shell} ${shellArgs.join(' ')}`);
            this.logger.info(`Working directory: ${workspaceRoot}`);

            this.currentProcess = spawn(shell, shellArgs, {
                cwd: workspaceRoot,
                env: { ...process.env },
                shell: false
            });

            this.currentProcess.stdout?.on('data', (data: Buffer) => {
                const lines = data.toString().split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        this.outputChannel.appendLine(line);
                        this.outputParser.parseLine(line);
                    }
                }
            });

            this.currentProcess.stderr?.on('data', (data: Buffer) => {
                const lines = data.toString().split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        this.outputChannel.appendLine(line);
                        this.outputParser.parseLine(line);
                    }
                }
            });

            this.currentProcess.on('close', (code) => {
                this.currentProcess = null;
                if (code === 0) {
                    this.logger.info('Colcon process completed successfully');
                    resolve();
                } else {
                    const error = new Error(`colcon exited with code ${code}`);
                    this.logger.error('Colcon process failed', error);
                    reject(error);
                }
            });

            this.currentProcess.on('error', (error) => {
                this.currentProcess = null;
                this.logger.error('Failed to spawn colcon process', error);
                reject(error);
            });
        });
    }

    private spawnDocker(args: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                reject(new Error('No workspace folder open'));
                return;
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;

            this.currentProcess = spawn('docker', args, {
                cwd: workspaceRoot,
                env: { ...process.env },
                shell: false
            });

            this.currentProcess.stdout?.on('data', (data: Buffer) => {
                const lines = data.toString().split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        this.outputChannel.appendLine(line);
                        this.outputParser.parseLine(line);
                    }
                }
            });

            this.currentProcess.stderr?.on('data', (data: Buffer) => {
                const lines = data.toString().split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        this.outputChannel.appendLine(line);
                        this.outputParser.parseLine(line);
                    }
                }
            });

            this.currentProcess.on('close', (code) => {
                this.currentProcess = null;
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`docker exited with code ${code}`));
                }
            });

            this.currentProcess.on('error', (error) => {
                this.currentProcess = null;
                reject(error);
            });
        });
    }

    private spawnCommand(command: string, args: string[], cwd: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const process = spawn(command, args, { cwd, shell: true });

            process.stdout?.on('data', (data: Buffer) => {
                this.outputChannel.appendLine(data.toString());
            });

            process.stderr?.on('data', (data: Buffer) => {
                this.outputChannel.appendLine(data.toString());
            });

            process.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`${command} exited with code ${code}`));
                }
            });

            process.on('error', reject);
        });
    }

    private handleBuildEvent(event: BuildEvent): void {
        // Events can be used by UI to update status
        // For now, we just log them
        switch (event.type) {
            case 'packageStart':
                this.outputChannel.appendLine(`\n>>> Building ${event.packageName}...`);
                // Send progress update
                if (this.onProgressCallback) {
                    const progress = this.outputParser.getProgress();
                    this.onProgressCallback(progress);
                }
                break;
            case 'packageSuccess':
                this.outputChannel.appendLine(`<<< Finished ${event.packageName}`);
                // Send progress update
                if (this.onProgressCallback) {
                    const progress = this.outputParser.getProgress();
                    this.onProgressCallback(progress);
                }
                break;
            case 'packageFailure':
                this.outputChannel.appendLine(`!!! Failed ${event.packageName}`);
                // Send progress update
                if (this.onProgressCallback) {
                    const progress = this.outputParser.getProgress();
                    this.onProgressCallback(progress);
                }
                break;
        }
    }

    private createEmptyResult(): BuildResult {
        return {
            success: false,
            packages: new Map(),
            totalErrors: 0,
            totalWarnings: 0,
            duration: 0,
            timestamp: Date.now()
        };
    }

    cancelBuild(): void {
        if (this.currentProcess) {
            this.logger.info('Cancelling build...');
            this.isCancelled = true;
            this.currentProcess.kill('SIGINT');
            // 也杀死子进程组
            try {
                process.kill(-this.currentProcess.pid!, 'SIGINT');
            } catch (e) {
                // 忽略错误
            }
            this.currentProcess = null;
            this.isBuilding = false;
            this.outputChannel.appendLine('\n[Build] 编译已被用户取消');
            this.logger.info('Build cancelled');
        }
    }

    isBuildInProgress(): boolean {
        return this.isBuilding;
    }

    getIsCancelled(): boolean {
        return this.isCancelled;
    }
}
