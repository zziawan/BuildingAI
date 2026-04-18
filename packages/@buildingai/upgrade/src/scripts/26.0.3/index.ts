import { Menu } from "@buildingai/db/entities";
import { Repository } from "typeorm";

import { BaseUpgradeScript, UpgradeContext } from "../../index";

type MenuComponentPatch = {
    code: string;
    path: string;
    targetComponent: string;
};

const MENU_COMPONENT_PATCHES: MenuComponentPatch[] = [
    {
        code: "api-key",
        path: "api-key",
        targetComponent: "/src/pages/console/ai/api-key/index.tsx",
    },
    {
        code: "ai-config-mcp-server",
        path: "mcp",
        targetComponent: "/src/pages/console/ai/mcp/index.tsx",
    },
    {
        code: "ai-config-provide",
        path: "provider",
        targetComponent: "/src/pages/console/ai/provider/index.tsx",
    },
    {
        code: "api-key-manage",
        path: "secret",
        targetComponent: "/src/pages/console/ai/secret/index.tsx",
    },
];

export class Upgrade extends BaseUpgradeScript {
    readonly version = "26.0.3";

    async execute(context: UpgradeContext): Promise<void> {
        this.log("Start upgrading to version 26.0.3");

        const menuRepository = context.dataSource.getRepository(Menu);

        for (const patch of MENU_COMPONENT_PATCHES) {
            await this.updateMenuComponent(menuRepository, patch);
        }

        this.success("Console menu component paths aligned for AI config pages");
    }

    private async updateMenuComponent(
        menuRepository: Repository<Menu>,
        patch: MenuComponentPatch,
    ): Promise<void> {
        const menu = await menuRepository.findOne({
            where: [{ code: patch.code }, { path: patch.path }],
        });

        if (!menu) {
            this.log(`Menu ${patch.code}/${patch.path} not found, skip`);
            return;
        }

        if (menu.component === patch.targetComponent) {
            this.log(`Menu ${patch.code} component already aligned, skip`);
            return;
        }

        menu.component = patch.targetComponent;
        await menuRepository.save(menu);

        this.log(`Menu ${patch.code} component updated to ${patch.targetComponent}`);
    }
}

export default Upgrade;