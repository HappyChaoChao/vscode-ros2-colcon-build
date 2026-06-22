import * as vscode from 'vscode';

export class Settings {
    private getConfiguration(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration('ros2-colcon-build');
    }

    getDefaultBuildType(): string {
        return this.getConfiguration().get<string>('defaultBuildType', 'Release');
    }

    getDefaultParallelWorkers(): number {
        return this.getConfiguration().get<number>('defaultParallelWorkers', 4);
    }

    getDefaultSymlinkInstall(): boolean {
        return this.getConfiguration().get<boolean>('defaultSymlinkInstall', true);
    }

    getDefaultContinueOnError(): boolean {
        return this.getConfiguration().get<boolean>('defaultContinueOnError', false);
    }

    getDockerEnabled(): boolean {
        return this.getConfiguration().get<boolean>('docker.enabled', false);
    }

    getDockerBuilderName(): string {
        return this.getConfiguration().get<string>('docker.builderName', 'arm64-builder');
    }

    getDockerPlatform(): string {
        return this.getConfiguration().get<string>('docker.platform', 'linux/arm64');
    }

    getColconArgs(): string[] {
        return this.getConfiguration().get<string[]>('colconArgs', []);
    }

    getScanDepth(): number {
        return this.getConfiguration().get<number>('scanDepth', 4);
    }

    onConfigurationChanged(callback: () => void): vscode.Disposable {
        return vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('ros2-colcon-build')) {
                callback();
            }
        });
    }
}
