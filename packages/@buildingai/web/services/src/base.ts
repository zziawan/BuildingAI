import { createHttpClient, createStandardApiParser, type HttpError } from "@buildingai/http";
import { useAuthStore } from "@buildingai/stores";
import type { AxiosError } from "axios";
import { toast } from "sonner";

const isDev = import.meta.env.DEV;
const devBase = import.meta.env.VITE_DEVELOP_APP_BASE_URL;
const prodBase = import.meta.env.VITE_PRODUCTION_APP_BASE_URL;

export function generateWebApiBase() {
    const base: string = isDev ? devBase : prodBase;
    return `${base}${import.meta.env.VITE_APP_WEB_API_PREFIX || "/api"}`;
}

function handleHttpError(error: HttpError): void {
    // Don't show error toasts when user is not authenticated
    if (!useAuthStore.getState().auth.token) return;
    const message = error.message || "Bad request";
    toast.error(message);
}

async function handleAuthError(error: unknown): Promise<void> {
    await useAuthStore.getState().authActions.logout();

    // If already on login page, don't show toast or redirect
    if (location.pathname.includes("/login")) {
        return;
    }

    if (error && typeof error === "object" && "response" in error) {
        const axiosError = error as AxiosError<{ message?: string }>;
        const message = axiosError.response?.data?.message;
        if (message) {
            toast.error(message);
        }
    }
    location.replace(`/login?redirect=${location.pathname}`);
}

export const apiHttpClient = createHttpClient({
    baseURL: isDev ? devBase : prodBase,
    pathPrefix: import.meta.env.VITE_APP_WEB_API_PREFIX || "/api",
    parseResponse: createStandardApiParser(),
    hooks: {
        getAccessToken: async () => {
            return useAuthStore.getState().auth.token || "";
        },
        onAuthError: handleAuthError,
        onError: handleHttpError,
    },
});

export const consoleHttpClient = createHttpClient({
    baseURL: isDev ? devBase : prodBase,
    pathPrefix: import.meta.env.VITE_APP_CONSOLE_API_PREFIX || "/console",
    parseResponse: createStandardApiParser(),
    hooks: {
        getAccessToken: async () => {
            return useAuthStore.getState().auth.token || "";
        },
        onAuthError: handleAuthError,
        onError: handleHttpError,
    },
});

/**
 * Extract plugin identifier from URL path
 * URL format: domain/{pluginIdentifier}/xxx
 */
function getPluginIdentifierFromUrl(): string {
    const pathname = window.location.pathname;
    const match = pathname.match(/^\/extension\/([^/]+)/);
    if (!match) {
        throw new Error("Unable to extract plugin identifier from URL path");
    }
    return match[1] || "unknow";
}

async function handlePluginAuthError(error: unknown): Promise<void> {
    if (error && typeof error === "object" && "response" in error) {
        const axiosError = error as AxiosError<{ message?: string }>;
        const message = axiosError.response?.data?.message;
        if (message) {
            toast.error(message);
        }
    }
    await useAuthStore.getState().authActions.logout();

    if (isDev) {
        location.replace(`${devBase}/login?redirect=${encodeURIComponent(location.href)}`);
    } else {
        location.replace(`/login?redirect=${location.pathname}`);
    }
}

/**
 * Create plugin-specific HTTP clients with plugin identifier in path prefix
 * @param pluginIdentifier - Plugin unique identifier, if not provided, will extract from URL
 * @returns Object containing apiHttpClient and consoleHttpClient for plugin
 */
export function createPluginHttpClients(pluginIdentifier?: string) {
    const identifier = pluginIdentifier || getPluginIdentifierFromUrl();

    const pluginApiHttpClient = createHttpClient({
        baseURL: isDev ? devBase : prodBase,
        pathPrefix: `/${identifier}${import.meta.env.VITE_APP_WEB_API_PREFIX || "/api"}`,
        parseResponse: createStandardApiParser(),
        hooks: {
            getAccessToken: async () => {
                return useAuthStore.getState().auth.token || "";
            },
            onAuthError: handlePluginAuthError,
            onError: handleHttpError,
        },
    });

    const pluginConsoleHttpClient = createHttpClient({
        baseURL: isDev ? devBase : prodBase,
        pathPrefix: `/${identifier}${import.meta.env.VITE_APP_CONSOLE_API_PREFIX || "/console"}`,
        parseResponse: createStandardApiParser(),
        hooks: {
            getAccessToken: async () => {
                return useAuthStore.getState().auth.token || "";
            },
            onAuthError: handlePluginAuthError,
            onError: handleHttpError,
        },
    });

    return {
        apiHttpClient: pluginApiHttpClient,
        consoleHttpClient: pluginConsoleHttpClient,
    };
}
