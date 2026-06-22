import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { Ros2Package, DockerBuildOptions, BuildResult } from '../types';
import { OutputParser } from './outputParser';
import { OutputChannelManager } from '../ui/outputChannel';
import { Settings } from '../config/settings';

export class DockerBuilder {
    private outputChannel: OutputChannelManager;
    private outputParser: OutputParser;
    private settings: Settings;
    private currentProcess: ChildProcess | null = null;

    constructor(
        outputChannel: OutputChannelManager,
        outputParser: OutputParser,
        settings: Settings
    ) {
        this.outputChannel = outputChannel;
        this.outputParser = outputParser;
        this.settings = settings;
    }

    async checkDockerAvailable(): Promise<boolean> {
        try {
            await this.spawnCommand('docker', ['--version']);
            return true;
        } catch {
            return false;
        }
    }

    async checkBuilderExists(builderName: string): Promise<boolean> {
        try {
            const output = await this.getCommandOutput('docker', ['buildx', 'ls']);
            return output.includes(builderName);
        } catch {
            return false;
        }
    }

    async createBuilder(builderName: string): Promise<void> {
        this.outputChannel.appendLine(`[Docker] Creating builder: ${builderName}`);
        await this.spawnCommand('docker', ['buildx', 'create', '--name', builderName, '--use']);
        this.outputChannel.appendLine(`[Docker] Builder created: ${builderName}`);
    }

    async checkQemuRegistered(): Promise<boolean> {
        try {
            const output = await this.getCommandOutput('docker', ['run', '--rm', 'multiarch/qemu-user-static', 'ls']);
            return true;
        } catch {
            return false;
        }
    }

    async setupQemu(): Promise<void> {
        this.outputChannel.appendLine('[Docker] Setting up QEMU for multi-arch support...');
        await this.spawnCommand('docker', [
            'run', '--rm', '--privileged',
            'multiarch/qemu-user-static', '--reset', '-p', 'yes'
        ]);
        this.outputChannel.appendLine('[Docker] QEMU setup complete');
    }

    async build(packages: Ros2Package[], options: DockerBuildOptions): Promise<BuildResult> {
        const startTime = Date.now();
        this.outputParser.reset();
        this.outputChannel.clear();
        this.outputChannel.show();

        const packageNames = packages.map(p => p.name);

        // Check Docker availability
        if (!(await this.checkDockerAvailable())) {
            throw new Error('Docker is not installed or not in PATH');
        }

        // Check if builder exists
        if (!(await this.checkBuilderExists(options.builderName))) {
            const create = await vscode.window.showWarningMessage(
                `Docker builder "${options.builderName}" does not exist. Create it?`,
                'Yes', 'No'
            );
            if (create === 'Yes') {
                await this.createBuilder(options.builderName);
            } else {
                throw new Error('Docker builder not available');
            }
        }

        this.outputChannel.appendLine(`[Docker Build] Starting for ${packageNames.length} packages...`);
        this.outputChannel.appendLine(`[Docker Build] Platform: ${options.platform}`);
        this.outputChannel.appendLine(`[Docker Build] Builder: ${options.builderName}`);
        this.outputChannel.appendLine('');

        // Build docker command
        const args = [
            'buildx', 'build',
            '--platform', options.platform,
            '--builder', options.builderName,
            '--build-arg', `BUILD_PACKAGES=${packageNames.join(' ')}`,
            '--build-arg', `BUILD_TYPE=${options.buildType}`,
            '--build-arg', `PARALLEL_WORKERS=${options.parallelWorkers}`,
            '--build-arg', `SYMLINK_INSTALL=${options.symlinkInstall ? 'ON' : 'OFF'}`,
            '--build-arg', `CONTINUE_ON_ERROR=${options.continueOnError ? 'ON' : 'OFF'}`,
            '--target', 'export',
            '--output', 'type=local,dest=./dist',
            '.'
        ];

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

        this.outputChannel.appendLine('');
        this.outputChannel.appendLine(`[Docker Build] Completed in ${(duration / 1000).toFixed(1)}s`);
        this.outputChannel.appendLine(`[Docker Build] ${result.totalErrors} errors, ${result.totalWarnings} warnings`);

        return result;
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

    private spawnCommand(command: string, args: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            const process = spawn(command, args, { shell: true });

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

    private getCommandOutput(command: string, args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            const process = spawn(command, args, { shell: true });
            let output = '';

            process.stdout?.on('data', (data: Buffer) => {
                output += data.toString();
            });

            process.on('close', (code) => {
                if (code === 0) {
                    resolve(output);
                } else {
                    reject(new Error(`${command} exited with code ${code}`));
                }
            });

            process.on('error', reject);
        });
    }

    cancelBuild(): void {
        if (this.currentProcess) {
            this.currentProcess.kill('SIGINT');
            this.currentProcess = null;
            this.outputChannel.appendLine('\n[Docker Build] Cancelled by user');
        }
    }
}
