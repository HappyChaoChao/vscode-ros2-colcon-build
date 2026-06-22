import * as vscode from 'vscode';
import * as path from 'path';
import { BuildDiagnostic } from '../types';

export class DiagnosticsManager {
    private diagnosticCollection: vscode.DiagnosticCollection;

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('ros2-build');
    }

    addDiagnostic(diagnostic: BuildDiagnostic): void {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return;
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        let filePath = diagnostic.file;

        // Make path absolute if relative
        if (!path.isAbsolute(filePath)) {
            filePath = path.join(workspaceRoot, filePath);
        }

        const uri = vscode.Uri.file(filePath);
        const range = new vscode.Range(
            new vscode.Position(diagnostic.line - 1, diagnostic.column - 1),
            new vscode.Position(diagnostic.line - 1, diagnostic.column + 10)
        );

        const severity = diagnostic.severity === 'error'
            ? vscode.DiagnosticSeverity.Error
            : vscode.DiagnosticSeverity.Warning;

        const vscodeDiagnostic = new vscode.Diagnostic(range, diagnostic.message, severity);
        vscodeDiagnostic.source = 'ros2-build';

        const existing = this.diagnosticCollection.get(uri) || [];
        this.diagnosticCollection.set(uri, [...existing, vscodeDiagnostic]);
    }

    addDiagnostics(diagnostics: BuildDiagnostic[]): void {
        for (const diag of diagnostics) {
            this.addDiagnostic(diag);
        }
    }

    clear(): void {
        this.diagnosticCollection.clear();
    }

    clearForFile(filePath: string): void {
        const uri = vscode.Uri.file(filePath);
        this.diagnosticCollection.delete(uri);
    }

    dispose(): void {
        this.diagnosticCollection.dispose();
    }
}
