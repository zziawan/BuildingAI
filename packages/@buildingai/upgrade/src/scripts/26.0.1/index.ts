import { Menu } from "@buildingai/db/entities";
import { Repository } from "typeorm";

import { BaseUpgradeScript, UpgradeContext } from "../../index";

/**
 * Upgrade script 26.0.1
 *
 * Align console menu permission codes with latest frontend/backend behavior:
 * - `api-key` should be accessible to all logged-in users (permissionCode = null)
 * - `ai-agent` should require explicit permission (permissionCode = "agents:list")
 */
export class Upgrade extends BaseUpgradeScript {
    readonly version = "26.0.1";

    async execute(context: UpgradeContext): Promise<void> {
        this.log("Start upgrading to version 26.0.1");

        const menuRepository = context.dataSource.getRepository(Menu);

        await this.updateMenuPermissionCode(menuRepository, "api-key", null);
        await this.updateMenuPermissionCode(menuRepository, "ai-agent", "agents:list");

        this.success("Menu permission codes aligned for api-key and ai-agent");
    }

    private async updateMenuPermissionCode(
        menuRepository: Repository<Menu>,
        code: string,
        targetPermissionCode: string | null,
    ): Promise<void> {
        const menu = await menuRepository.findOne({ where: { code } });

        if (!menu) {
            this.log(`Menu ${code} not found, skip updating permissionCode`);
            return;
        }

        if (menu.permissionCode === targetPermissionCode) {
            this.log(`Menu ${code} permissionCode already ${String(targetPermissionCode)}, skip`);
            return;
        }

        menu.permissionCode = targetPermissionCode as unknown as string;
        await menuRepository.save(menu);

        this.log(`Menu ${code} permissionCode updated to ${String(targetPermissionCode)}`);
    }
}

export default Upgrade;
