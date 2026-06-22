import * as vscode from 'vscode';

export interface BuildHistoryEntry {
    id: string;
    timestamp: number;
    packages: string[];
    buildType: string;
    success: boolean;
    errors: number;
    warnings: number;
    duration: number;
    mode: 'local' | 'docker';
}

export class BuildHistory {
    private context: vscode.ExtensionContext;
    private static readonly MAX_ENTRIES = 50;
    private static readonly STORAGE_KEY = 'ros2-build-history';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    addEntry(entry: Omit<BuildHistoryEntry, 'id'>): void {
        const history = this.getHistory();
        const newEntry: BuildHistoryEntry = {
            ...entry,
            id: Date.now().toString()
        };

        history.unshift(newEntry);

        // Keep only last N entries
        if (history.length > BuildHistory.MAX_ENTRIES) {
            history.pop();
        }

        this.context.globalState.update(BuildHistory.STORAGE_KEY, history);
    }

    getHistory(): BuildHistoryEntry[] {
        return this.context.globalState.get<BuildHistoryEntry[]>(BuildHistory.STORAGE_KEY, []);
    }

    getLastEntry(): BuildHistoryEntry | undefined {
        const history = this.getHistory();
        return history.length > 0 ? history[0] : undefined;
    }

    clearHistory(): void {
        this.context.globalState.update(BuildHistory.STORAGE_KEY, []);
    }

    async showHistory(): Promise<void> {
        const history = this.getHistory();

        if (history.length === 0) {
            vscode.window.showInformationMessage('No build history');
            return;
        }

        const items = history.map(entry => ({
            label: `${entry.success ? '$(check)' : '$(error)'} ${entry.packages.join(', ')}`,
            description: `${entry.buildType} | ${entry.errors} errors | ${(entry.duration / 1000).toFixed(1)}s`,
            detail: new Date(entry.timestamp).toLocaleString(),
            entry: entry
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a build to view details or rebuild'
        });

        if (selected) {
            const action = await vscode.window.showQuickPick(
                ['View Details', 'Rebuild', 'Rebuild with Same Settings'],
                { placeHolder: 'What would you like to do?' }
            );

            if (action === 'View Details') {
                this.showEntryDetails(selected.entry);
            } else if (action === 'Rebuild') {
                vscode.commands.executeCommand('ros2.buildSelected');
            }
        }
    }

    private showEntryDetails(entry: BuildHistoryEntry): void {
        const details = [
            `Build ID: ${entry.id}`,
            `Time: ${new Date(entry.timestamp).toLocaleString()}`,
            `Mode: ${entry.mode}`,
            `Build Type: ${entry.buildType}`,
            `Packages: ${entry.packages.join(', ')}`,
            `Result: ${entry.success ? 'Success' : 'Failed'}`,
            `Errors: ${entry.errors}`,
            `Warnings: ${entry.warnings}`,
            `Duration: ${(entry.duration / 1000).toFixed(1)}s`
        ].join('\n');

        vscode.window.showInformationMessage(details, { modal: true });
    }
}
