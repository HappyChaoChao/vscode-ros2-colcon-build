import * as vscode from 'vscode';

export class OutputChannelManager {
    private channel: vscode.OutputChannel;

    constructor() {
        this.channel = vscode.window.createOutputChannel('ROS2 Build');
    }

    appendLine(line: string): void {
        this.channel.appendLine(line);
    }

    append(text: string): void {
        this.channel.append(text);
    }

    clear(): void {
        this.channel.clear();
    }

    show(): void {
        this.channel.show(true);
    }

    hide(): void {
        this.channel.hide();
    }

    dispose(): void {
        this.channel.dispose();
    }
}
