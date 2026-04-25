import { BaseController } from "@buildingai/base";
import { Public } from "@buildingai/decorators/public.decorator";
import { DictService } from "@buildingai/dict";
import { WebController } from "@common/decorators/controller.decorator";
import { Get } from "@nestjs/common";

/**
 * 前台装修页面控制器
 *
 * 提供前台布局配置和微页面的查询功能
 */
const DICT_GROUP = "decorate";
const DICT_KEY = "menu-config";
const HOME_MENU_ID = "menu_home_fixed";
const MODEL_MENU_ID = "menu_model";
const USER_API_KEY_MENU_ID = "menu_user_api_key";

export interface DecorateMenuLink {
    label: string;
    path: string;
    type: "system" | "extension" | "custom" | "button";
    query: Record<string, string>;
    component: string | null;
    target: "_self" | "_blank";
}

export interface DecorateMenuItem {
    id: string;
    icon: string;
    title: string;
    link: DecorateMenuLink;
    isHidden?: boolean;
}

export interface DecorateMenuConfig {
    layout: string;
    menus: DecorateMenuItem[];
}

const DEFAULT_CONFIG: DecorateMenuConfig = {
    layout: "default",
    menus: [],
};

const DEFAULT_HOME_MENU: DecorateMenuItem = {
    id: HOME_MENU_ID,
    icon: "square-pen",
    title: "AI助手",
    isHidden: false,
    link: {
        label: "AI助手",
        path: "/",
        type: "system",
        query: {},
        component: "/src/pages/chat/index.tsx",
        target: "_self",
    },
};

const DEFAULT_MODEL_MENU: DecorateMenuItem = {
    id: MODEL_MENU_ID,
    icon: "bot",
    title: "模型广场",
    isHidden: false,
    link: {
        label: "模型广场",
        path: "/model",
        type: "system",
        query: {},
        component: "/src/pages/console/ai/model/index.tsx",
        target: "_self",
    },
};

const DEFAULT_USER_API_KEY_MENU: DecorateMenuItem = {
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

@WebController("decorate")
export class DecorateWebController extends BaseController {
    constructor(private readonly dictService: DictService) {
        super();
    }

    @Get("menu")
    @Public()
    async getDecorateMenuConfig() {
        const stored = await this.dictService.get<Partial<DecorateMenuConfig>>(
            DICT_KEY,
            undefined,
            DICT_GROUP,
        );

        const config = { ...DEFAULT_CONFIG, ...(stored || {}) };

        if (config.menus && Array.isArray(config.menus)) {
            config.menus = this.ensureDefaultHomeMenus(config.menus).filter((menu) => !menu.isHidden);
        }

        return config;
    }

    private ensureDefaultHomeMenus(menus: DecorateMenuItem[]): DecorateMenuItem[] {
        const homeMenu = this.mergeMenu(
            menus.find((menu) => menu.id === HOME_MENU_ID),
            DEFAULT_HOME_MENU,
        );
        const modelMenu = this.mergeMenu(
            menus.find((menu) => menu.id === MODEL_MENU_ID),
            DEFAULT_MODEL_MENU,
        );
        const userApiKeyMenu = this.mergeMenu(
            menus.find((menu) => menu.id === USER_API_KEY_MENU_ID),
            DEFAULT_USER_API_KEY_MENU,
        );

        const menusWithoutTargets = menus.filter(
            (menu) =>
                menu.id !== HOME_MENU_ID &&
                menu.id !== MODEL_MENU_ID &&
                menu.id !== USER_API_KEY_MENU_ID,
        );

        const insertIndex = 1;

        return [
            ...menusWithoutTargets.slice(0, insertIndex - 1),
            homeMenu,
            modelMenu,
            userApiKeyMenu,
            ...menusWithoutTargets.slice(insertIndex - 1),
        ];
    }

    private mergeMenu(
        existingMenu: DecorateMenuItem | undefined,
        defaultMenu: DecorateMenuItem,
    ): DecorateMenuItem {
        return {
            ...existingMenu,
            ...defaultMenu,
            link: {
                ...(existingMenu?.link ?? {}),
                ...defaultMenu.link,
            },
            isHidden: false,
        };
    }
}
