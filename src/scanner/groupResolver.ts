import * as path from 'path';

export class GroupResolver {
    private workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    resolveGroup(packagePath: string): string {
        // Get relative path from workspace root
        const relativePath = path.relative(this.workspaceRoot, packagePath);
        const parts = relativePath.split(path.sep);

        // Expected structure: src/<group>/<package> or src/<group>/<subgroup>/<package>
        if (parts.length >= 2 && parts[0] === 'src') {
            return parts[1];
        }

        // Fallback: use first directory after src
        const srcIndex = parts.indexOf('src');
        if (srcIndex >= 0 && srcIndex < parts.length - 1) {
            return parts[srcIndex + 1];
        }

        return 'ungrouped';
    }

    getGroupDisplayName(group: string): string {
        // Convert amr_drivers -> AMR Drivers
        return group
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    getAllGroups(packages: { group: string }[]): string[] {
        const groups = new Set<string>();
        for (const pkg of packages) {
            groups.add(pkg.group);
        }
        return Array.from(groups).sort();
    }
}
