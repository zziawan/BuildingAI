import { useState } from "react";
import { toast } from "sonner";

/**
 * 安全地将文本复制到剪贴板。
 * 优先使用 Clipboard API（HTTPS / localhost），不可用时降级为 execCommand。
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
    if (navigator?.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // fall through to execCommand
        }
    }
    // execCommand fallback（HTTP 远程环境）
    try {
        const el = document.createElement("textarea");
        el.value = text;
        el.style.cssText = "position:fixed;top:0;left:0;opacity:0";
        document.body.appendChild(el);
        el.focus();
        el.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(el);
        return ok;
    } catch {
        return false;
    }
}

/**
 * Copy text to clipboard hook
 *
 * @returns Object with copy function and loading state
 *
 * @example
 * ```tsx
 * const { copy, isCopying } = useCopy();
 *
 * const handleCopy = async () => {
 *   await copy("text to copy");
 * };
 * ```
 */
export function useCopy() {
    const [isCopying, setIsCopying] = useState(false);

    const copy = async (text: string) => {
        if (!text) {
            toast.error("No content to copy");
            return false;
        }

        setIsCopying(true);
        try {
            const ok = await copyTextToClipboard(text);
            if (ok) {
                toast.success("Copied to clipboard");
            } else {
                toast.error("Failed to copy");
            }
            return ok;
        } finally {
            setIsCopying(false);
        }
    };

    return { copy, isCopying };
}
