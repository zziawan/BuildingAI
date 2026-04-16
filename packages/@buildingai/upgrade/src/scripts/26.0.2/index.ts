import { Dict } from "@buildingai/db/entities";

import { BaseUpgradeScript, UpgradeContext } from "../../index";

type MenuConfig = {
    menus?: MenuItem[];
    [key: string]: unknown;
};

type MenuItem = {
    id: string;
    icon?: string;
    title?: string;
    link?: {
        label?: string;
        path?: string;
        type?: string;
        query?: Record<string, unknown>;
        component?: string | null;
        target?: "_self" | "_blank";
    };
    isHidden?: boolean;
    [key: string]: unknown;
};

const DICT_GROUP = "decorate";
const DICT_KEY = "menu-config";
const HOME_MENU_ID = "menu_home_fixed";
const MODEL_MENU_ID = "menu_model";
const USER_API_KEY_MENU_ID = "menu_user_api_key";

const MODEL_MENU_DEFAULT: MenuItem = {
    id: MODEL_MENU_ID,
    icon: "bot",
    title: "模型",
    isHidden: false,
    link: {
        label: "模型",
        path: "/model",
        type: "system",
        query: {},
        component: "/src/pages/console/ai/model/index.tsx",
        target: "_self",
    },
};

const USER_API_KEY_MENU_DEFAULT: MenuItem = {
    id: USER_API_KEY_MENU_ID,
    icon: "key-round",
    title: "用户API-Key",
    isHidden: false,
    link: {
        label: "用户API-Key",
        path: "/modelapi",
        type: "system",
        query: {},
        component: "/src/pages/modelapi/index.tsx",
        target: "_self",
    },
};

export class Upgrade extends BaseUpgradeScript {
    readonly version = "26.0.2";

    async execute(context: UpgradeContext): Promise<void> {
        this.log("Start upgrading to version 26.0.2");

        const dictRepository = context.dataSource.getRepository(Dict);
        const menuConfigDict = await dictRepository.findOne({
            where: {
                group: DICT_GROUP,
                key: DICT_KEY,
            },
        });

        if (!menuConfigDict) {
            this.log("decorate/menu-config not found, skip");
            return;
        }

        const menuConfig = this.parseMenuConfig(menuConfigDict.value);
        if (!menuConfig) {
            this.log("decorate/menu-config parse failed, skip");
            return;
        }

        const menus = Array.isArray(menuConfig.menus) ? menuConfig.menus : [];

        const existingModelMenu = menus.find((menu) => menu.id === MODEL_MENU_ID);
        const existingUserApiKeyMenu = menus.find((menu) => menu.id === USER_API_KEY_MENU_ID);

        const modelMenu = this.mergeMenu(existingModelMenu, MODEL_MENU_DEFAULT);
        const userApiKeyMenu = this.mergeMenu(existingUserApiKeyMenu, USER_API_KEY_MENU_DEFAULT);

        const menusWithoutTarget = menus.filter(
            (menu) => menu.id !== MODEL_MENU_ID && menu.id !== USER_API_KEY_MENU_ID,
        );

        const homeMenuIndex = menusWithoutTarget.findIndex((menu) => menu.id === HOME_MENU_ID);
        const insertIndex = homeMenuIndex >= 0 ? homeMenuIndex + 1 : 0;

        const nextMenus = [
            ...menusWithoutTarget.slice(0, insertIndex),
            modelMenu,
            userApiKeyMenu,
            ...menusWithoutTarget.slice(insertIndex),
        ];

        if (JSON.stringify(menus) === JSON.stringify(nextMenus)) {
            this.log("menu-config already aligned, skip");
            return;
        }

        const nextMenuConfig: MenuConfig = {
            ...menuConfig,
            menus: nextMenus,
        };

        await dictRepository.update(menuConfigDict.id, {
            value: JSON.stringify(nextMenuConfig),
        });

        this.success("Decorate menu config updated with model and user api-key under home");
    }

    private parseMenuConfig(rawValue: string): MenuConfig | null {
        try {
            return JSON.parse(rawValue) as MenuConfig;
        } catch {
            return null;
        }
    }

    private mergeMenu(existingMenu: MenuItem | undefined, defaultMenu: MenuItem): MenuItem {
        return {
            ...existingMenu,
            ...defaultMenu,
            link: {
                ...(existingMenu?.link ?? {}),
                ...(defaultMenu.link ?? {}),
            },
            isHidden: false,
        };
    }
}

export default Upgrade;