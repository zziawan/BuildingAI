import { useConfigStore } from "@buildingai/stores";
import SvgIcons from "@buildingai/ui/components/svg-icons";

type LoginLayoutProps = {
  children: React.ReactNode;
};

/**
 * 登录相关页统一外壳（Logo + 内容区），保持与 /login 一致的风格
 */
export function LoginLayout({ children }: LoginLayoutProps) {
  const { websiteConfig } = useConfigStore((state) => state.config);

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <a href="#" className="flex items-center gap-2 self-center font-medium">
          {websiteConfig?.webinfo.logo ? (
            <div className="flex items-center gap-2">
              <img className="h-8" src={websiteConfig?.webinfo.logo} alt="logo" />
              <span className="text-xl font-bold">{websiteConfig?.webinfo.name}</span>
            </div>
          ) : (
            <SvgIcons.buildingaiFull className="h-8" />
          )}
        </a>
        {children}
      </div>
    </div>
  );
}
