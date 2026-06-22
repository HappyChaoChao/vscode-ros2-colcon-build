import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import { EventEmitter } from 'events';

export interface ProcessOptions {
    command: string;
    args: string[];
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    shell?: boolean;
}

export interface ProcessResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}

export class ProcessRunner extends EventEmitter {
    private process: ChildProcess | null = null;
    private stdout: string = '';
    private stderr: string = '';

    async run(options: ProcessOptions): Promise<ProcessResult> {
        return new Promise((resolve, reject) => {
            const spawnOptions: SpawnOptions = {
                cwd: options.cwd || process.cwd(),
                env: options.env || process.env,
                shell: options.shell !== undefined ? options.shell : true
            };

            this.process = spawn(options.command, options.args, spawnOptions);
            this.stdout = '';
            this.stderr = '';

            this.process.stdout?.on('data', (data: Buffer) => {
                const text = data.toString();
                this.stdout += text;
                this.emit('stdout', text);
            });

            this.process.stderr?.on('data', (data: Buffer) => {
                const text = data.toString();
                this.stderr += text;
                this.emit('stderr', text);
            });

            this.process.on('close', (code) => {
                this.process = null;
                resolve({
                    exitCode: code || 0,
                    stdout: this.stdout,
                    stderr: this.stderr
                });
            });

            this.process.on('error', (error) => {
                this.process = null;
                reject(error);
            });
        });
    }

    cancel(): void {
        if (this.process) {
            this.process.kill('SIGINT');
            this.process = null;
        }
    }

    isRunning(): boolean {
        return this.process !== null;
    }
}
