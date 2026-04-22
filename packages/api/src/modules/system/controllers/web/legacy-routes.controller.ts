import { Public } from "@buildingai/decorators/public.decorator";
import { Controller, Get, Param, Res, SetMetadata } from "@nestjs/common";
import type { Response } from "express";

@Controller()
@SetMetadata("SKIP_EXTENSION_GUARD", true)
export class LegacyRoutesWebController {
    @Public()
    @Get("model")
    redirectModel(@Res() res: Response) {
        return res.redirect(302, "/console/model");
    }

    @Public()
    @Get("model/usage/:id")
    redirectModelUsage(@Param("id") id: string, @Res() res: Response) {
        return res.redirect(302, `/console/model/usage/${encodeURIComponent(id)}`);
    }

    @Public()
    @Get("modelapi")
    redirectModelApi(@Res() res: Response) {
        return res.redirect(302, "/console/api-key");
    }
}
