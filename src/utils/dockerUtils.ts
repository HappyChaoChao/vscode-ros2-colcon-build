import { spawn } from 'child_process';

export class DockerUtils {
    static async isDockerInstalled(): Promise<boolean> {
        try {
            await DockerUtils.execCommand('docker', ['--version']);
            return true;
        } catch {
            return false;
        }
    }

    static async isDockerRunning(): Promise<boolean> {
        try {
            await DockerUtils.execCommand('docker', ['info']);
            return true;
        } catch {
            return false;
        }
    }

    static async isBuildxAvailable(): Promise<boolean> {
        try {
            await DockerUtils.execCommand('docker', ['buildx', 'version']);
            return true;
        } catch {
            return false;
        }
    }

    static async getBuilders(): Promise<string[]> {
        try {
            const output = await DockerUtils.getCommandOutput('docker', ['buildx', 'ls']);
            const lines = output.split('\n');
            const builders: string[] = [];

            for (const line of lines) {
                // Parse builder names from docker buildx ls output
                const match = line.match(/^(\S+)\s+/);
                if (match && !line.includes('NAME')) {
                    builders.push(match[1]);
                }
            }

            return builders;
        } catch {
            return [];
        }
    }

    static async builderExists(name: string): Promise<boolean> {
        const builders = await DockerUtils.getBuilders();
        return builders.includes(name);
    }

    static async createBuilder(name: string, platform: string = 'linux/arm64'): Promise<void> {
        await DockerUtils.execCommand('docker', [
            'buildx', 'create',
            '--name', name,
            '--platform', platform,
            '--use'
        ]);
    }

    static async removeBuilder(name: string): Promise<void> {
        await DockerUtils.execCommand('docker', ['buildx', 'rm', name]);
    }

    static async isQemuRegistered(): Promise<boolean> {
        try {
            // Check if qemu-user-static is registered
            const output = await DockerUtils.getCommandOutput('docker', [
                'run', '--rm', '--privileged',
                'multiarch/qemu-user-static',
                'ls'
            ]);
            return true;
        } catch {
            return false;
        }
    }

    static async setupQemu(): Promise<void> {
        await DockerUtils.execCommand('docker', [
            'run', '--rm', '--privileged',
            'multiarch/qemu-user-static',
            '--reset', '-p', 'yes'
        ]);
    }

    private static execCommand(command: string, args: string[]): Promise<void> {
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

    private static getCommandOutput(command: string, args: string[]): Promise<string> {
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
}
