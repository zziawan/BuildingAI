import { Menu } from "@buildingai/db/entities";
import { Repository } from "typeorm";

import { BaseUpgradeScript, UpgradeContext } from "../../index";

type MenuComponentPatch = {
    /** Menu code (preferred lookup key) */
    code?: string;
    /** Menu path segment (fallback lookup key) */
    path?: string;
    /** Correct component path pointing to the actual page file */
    targetComponent: string;
};

/**
 * Comprehensive mapping from stale/legacy component values to the correct
 * `/src/pages/console/...` paths that match the Vite glob keys.
 *
 * Covers every menu entry whose component was stored with an old path
 * (pre-dynamic-router era) that no longer resolves to a real file.
 */
const MENU_COMPONENT_PATCHES: MenuComponentPatch[] = [
    // ── Dashboard ─────────────────────────────────────────────────────────────
    {
        code: "dashboard",
        targetComponent: "/src/pages/console/dashboard/index.tsx",
    },

    // ── AI / Agent ────────────────────────────────────────────────────────────
    {
        code: "ai-agent",
        targetComponent: "/src/pages/console/ai/agent/list/index.tsx",
    },
    {
        code: "ai-agent-list",
        targetComponent: "/src/pages/console/ai/agent/list/index.tsx",
    },
    {
        code: "ai-agent-config",
        targetComponent: "/src/pages/console/ai/agent/config/index.tsx",
    },

    // ── AI / Datasets ─────────────────────────────────────────────────────────
    {
        code: "ai-datasets-list",
        targetComponent: "/src/pages/console/ai/datasets/list/index.tsx",
    },
    {
        code: "ai-datasets-config",
        targetComponent: "/src/pages/console/ai/datasets/config/index.tsx",
    },

    // ── AI / Model ────────────────────────────────────────────────────────────
    {
        code: "ai-models",
        targetComponent: "/src/pages/console/ai/model/index.tsx",
    },

    // ── Extension / Operation ─────────────────────────────────────────────────
    {
        code: "plugin-manage",
        targetComponent: "/src/pages/console/extension/index.tsx",
    },
    {
        code: "operation",
        targetComponent: "/src/pages/console/operation/index.tsx",
    },

    // ── Decorate ──────────────────────────────────────────────────────────────
    {
        code: "diy-layout",
        targetComponent: "/src/pages/console/decorate/layout/index.tsx",
    },
    {
        code: "apps-center",
        targetComponent: "/src/pages/console/decorate/apps/index.tsx",
    },
    {
        code: "agents",
        path: "agents",
        targetComponent: "/src/pages/console/decorate/agent/index.tsx",
    },

    // ── Chat ──────────────────────────────────────────────────────────────────
    {
        code: "conversation-ai-conversation",
        targetComponent: "/src/pages/console/chat/record/index.tsx",
    },
    {
        code: "122chat",
        targetComponent: "/src/pages/console/chat/config/index.tsx",
    },

    // ── User ──────────────────────────────────────────────────────────────────
    {
        code: "user-list",
        targetComponent: "/src/pages/console/user/list/index.tsx",
    },

    // ── Order ─────────────────────────────────────────────────────────────────
    {
        code: "membership-order",
        targetComponent: "/src/pages/console/order/membership/index.tsx",
    },
    {
        code: "order",
        path: "recharge",
        targetComponent: "/src/pages/console/order/recharge/index.tsx",
    },

    // ── Notice ────────────────────────────────────────────────────────────────
    {
        code: "sms-config",
        targetComponent: "/src/pages/console/notice/sms/index.tsx",
    },
    {
        code: "notification-settings",
        targetComponent: "/src/pages/console/notice/notification-settings/index.tsx",
    },

    // ── Channel ───────────────────────────────────────────────────────────────
    {
        code: "channel-wechat-oa",
        targetComponent: "/src/pages/console/channel/wechat-oa/index.tsx",
    },

    // ── Financial ─────────────────────────────────────────────────────────────
    {
        code: "financial-center",
        targetComponent: "/src/pages/console/financial/analysis/index.tsx",
    },
    {
        code: "account-balance",
        targetComponent: "/src/pages/console/financial/balance-details/index.tsx",
    },

    // ── Access / Permission ───────────────────────────────────────────────────
    {
        code: "system-permission-list",
        targetComponent: "/src/pages/console/access/permission/index.tsx",
    },
    {
        code: "system-role-list",
        targetComponent: "/src/pages/console/access/role/index.tsx",
    },
    {
        code: "system-menu",
        targetComponent: "/src/pages/console/access/menu/index.tsx",
    },

    // ── System Settings ───────────────────────────────────────────────────────
    {
        code: "system-loginConfig-get",
        targetComponent: "/src/pages/console/system/login-config/index.tsx",
    },
    {
        code: "system-agreement",
        targetComponent: "/src/pages/console/system/agreement/index.tsx",
    },
    {
        code: "system-website",
        targetComponent: "/src/pages/console/system/website-config/index.tsx",
    },
    {
        code: "system-payConfig-list",
        targetComponent: "/src/pages/console/system/pay-config/index.tsx",
    },
    {
        code: "system-storage-config",
        targetComponent: "/src/pages/console/system/storage-config/index.tsx",
    },
];

export class Upgrade extends BaseUpgradeScript {
    readonly version = "26.0.4";

    async execute(context: UpgradeContext): Promise<void> {
        this.log("Start upgrading to version 26.0.4");

        const menuRepository = context.dataSource.getRepository(Menu);

        let updated = 0;
        let skipped = 0;
        let notFound = 0;

        for (const patch of MENU_COMPONENT_PATCHES) {
            const result = await this.updateMenuComponent(menuRepository, patch);
            if (result === "updated") updated++;
            else if (result === "skipped") skipped++;
            else notFound++;
        }

        this.success(
            `Console menu component paths aligned for dynamic router. ` +
                `Updated: ${updated}, Already aligned: ${skipped}, Not found: ${notFound}`,
        );
    }

    private async updateMenuComponent(
        menuRepository: Repository<Menu>,
        patch: MenuComponentPatch,
    ): Promise<"updated" | "skipped" | "not-found"> {
        // Build OR conditions from provided identifiers
        const conditions: Parameters<Repository<Menu>["findOne"]>[0]["where"] = [];
        if (patch.code) conditions.push({ code: patch.code });
        if (patch.path) conditions.push({ path: patch.path });

        const menu = await menuRepository.findOne({ where: conditions });

        if (!menu) {
            this.log(`Menu ${patch.code ?? patch.path} not found, skip`);
            return "not-found";
        }

        if (menu.component === patch.targetComponent) {
            this.log(`Menu ${patch.code ?? patch.path} component already aligned, skip`);
            return "skipped";
        }

        menu.component = patch.targetComponent;
        await menuRepository.save(menu);

        this.log(`Menu ${patch.code ?? patch.path}: ${menu.component} → ${patch.targetComponent}`);
        return "updated";
    }
}
