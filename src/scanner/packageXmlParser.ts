import { XMLParser } from 'fast-xml-parser';

export interface PackageXmlInfo {
    name: string;
    buildType: 'ament_cmake' | 'ament_python';
    dependencies: string[];
    description: string;
}

export class PackageXmlParser {
    private parser: XMLParser;

    constructor() {
        this.parser = new XMLParser({
            ignoreAttributes: false,
            isArray: (name) => {
                return ['depend', 'build_depend', 'exec_depend', 'test_depend',
                    'buildtool_depend', 'doc_depend'].includes(name);
            }
        });
    }

    parse(xmlContent: string): PackageXmlInfo {
        const result = this.parser.parse(xmlContent);
        const pkg = result.package;

        if (!pkg) {
            throw new Error('Invalid package.xml: missing <package> element');
        }

        const name = this.extractName(pkg);
        const buildType = this.extractBuildType(pkg);
        const dependencies = this.extractDependencies(pkg);
        const description = this.extractDescription(pkg);

        return { name, buildType, dependencies, description };
    }

    private extractName(pkg: any): string {
        const name = pkg.name;
        if (!name) {
            throw new Error('Invalid package.xml: missing <name> element');
        }
        return typeof name === 'string' ? name : name['#text'] || '';
    }

    private extractBuildType(pkg: any): 'ament_cmake' | 'ament_python' {
        const exportSection = pkg.export;
        if (!exportSection) {
            return 'ament_cmake'; // default
        }

        const buildType = exportSection.build_type;
        if (!buildType) {
            return 'ament_cmake';
        }

        const typeStr = typeof buildType === 'string' ? buildType : buildType['#text'] || '';
        return typeStr.includes('python') ? 'ament_python' : 'ament_cmake';
    }

    private extractDependencies(pkg: any): string[] {
        const deps: Set<string> = new Set();

        // Extract from various dependency tags
        const depTags = ['depend', 'build_depend', 'exec_depend', 'test_depend'];
        for (const tag of depTags) {
            const items = pkg[tag];
            if (Array.isArray(items)) {
                for (const item of items) {
                    const dep = typeof item === 'string' ? item : item['#text'] || '';
                    if (dep) {
                        deps.add(dep);
                    }
                }
            }
        }

        return Array.from(deps);
    }

    private extractDescription(pkg: any): string {
        const desc = pkg.description;
        if (!desc) {
            return '';
        }
        return typeof desc === 'string' ? desc : desc['#text'] || '';
    }
}
