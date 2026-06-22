import * as vscode from 'vscode';

export type BuildStatus = 'idle' | 'building' | 'success' | 'failed';

export class StatusBarItem {
    private statusBarItem: vscode.StatusBarItem;
    private currentStatus: BuildStatus = 'idle';
    private lastBuildInfo: string = '';

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.statusBarItem.command = 'ros2.buildCurrent';
        this.updateDisplay();
        this.statusBarItem.show();
    }

    setStatus(status: BuildStatus, info?: string): void {
        this.currentStatus = status;
        if (info) {
            this.lastBuildInfo = info;
        }
        this.updateDisplay();
    }

    setBuildProgress(packageName: string, current: number, total: number): void {
        this.lastBuildInfo = `${packageName} (${current}/${total})`;
        this.updateDisplay();
    }

    private updateDisplay(): void {
        switch (this.currentStatus) {
            case 'idle':
                this.statusBarItem.text = '$(play) ROS2';
                this.statusBarItem.tooltip = 'ROS2 Build: Click to build current package';
                break;
            case 'building':
                this.statusBarItem.text = `$(sync~spin) Building ${this.lastBuildInfo}`;
                this.statusBarItem.tooltip = 'ROS2 Build in progress...';
                break;
            case 'success':
                this.statusBarItem.text = '$(check) ROS2';
                this.statusBarItem.tooltip = `ROS2 Build: Success ${this.lastBuildInfo}`;
                break;
            case 'failed':
                this.statusBarItem.text = '$(error) ROS2';
                this.statusBarItem.tooltip = `ROS2 Build: Failed ${this.lastBuildInfo}`;
                break;
        }
    }

    dispose(): void {
        this.statusBarItem.dispose();
    }
}
