import * as vscode from 'vscode';
import { spawn } from 'child_process';

export interface GitChange {
    filePath: string;
    status: 'modified' | 'added' | 'deleted' | 'renamed';
}

export class GitUtils {
    /**
     * 检查工作空间是否是 git 仓库
     */
    static async isGitRepository(workspaceRoot: string): Promise<boolean> {
        try {
            await GitUtils.execCommand('git', ['rev-parse', '--git-dir'], workspaceRoot);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 获取当前修改的文件列表（包括暂存区和工作区）
     */
    static async getChangedFiles(workspaceRoot: string): Promise<GitChange[]> {
        const changes: GitChange[] = [];

        try {
            // 获取暂存区的修改
            const stagedOutput = await GitUtils.getCommandOutput(
                'git', ['diff', '--cached', '--name-status'], workspaceRoot
            );
            changes.push(...GitUtils.parseGitStatus(stagedOutput));

            // 获取工作区的修改
            const unstagedOutput = await GitUtils.getCommandOutput(
                'git', ['diff', '--name-status'], workspaceRoot
            );
            changes.push(...GitUtils.parseGitStatus(unstagedOutput));

            // 获取未跟踪的新文件
            const untrackedOutput = await GitUtils.getCommandOutput(
                'git', ['ls-files', '--others', '--exclude-standard'], workspaceRoot
            );
            for (const file of untrackedOutput.split('\n').filter(f => f.trim())) {
                changes.push({
                    filePath: file.trim(),
                    status: 'added'
                });
            }

        } catch (error) {
            console.error('Error getting git changes:', error);
        }

        return changes;
    }

    /**
     * 解析 git status 输出
     */
    private static parseGitStatus(output: string): GitChange[] {
        const changes: GitChange[] = [];
        const lines = output.split('\n').filter(line => line.trim());

        for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length >= 2) {
                const statusChar = parts[0].charAt(0);
                const filePath = parts[parts.length - 1];

                let status: GitChange['status'];
                switch (statusChar) {
                    case 'M':
                        status = 'modified';
                        break;
                    case 'A':
                        status = 'added';
                        break;
                    case 'D':
                        status = 'deleted';
                        break;
                    case 'R':
                        status = 'renamed';
                        break;
                    default:
                        status = 'modified';
                }

                changes.push({ filePath, status });
            }
        }

        return changes;
    }

    /**
     * 根据修改的文件路径推断所属的功能包
     */
    static inferPackagesFromFiles(
        changedFiles: GitChange[],
        packageMap: Map<string, { name: string; path: string }>
    ): string[] {
        const matchedPackages = new Set<string>();

        for (const change of changedFiles) {
            // 跳过已删除的文件
            if (change.status === 'deleted') {
                continue;
            }

            // 检查每个包的路径
            for (const [pkgPath, pkgInfo] of packageMap) {
                if (change.filePath.startsWith(pkgPath + '/') || change.filePath === pkgPath) {
                    matchedPackages.add(pkgInfo.name);
                }
            }
        }

        return Array.from(matchedPackages);
    }

    private static execCommand(command: string, args: string[], cwd: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const process = spawn(command, args, { cwd, shell: true });
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

    private static getCommandOutput(command: string, args: string[], cwd: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const process = spawn(command, args, { cwd, shell: true });
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
