你现在的目标是：✅ **完全兼容 BullMQ 的标准写法** ✅ **代码结构清晰、模块化、可维护、可扩展**

## 我来帮你把你那段 Bull 版本的处理器重构成**专业、规范、可扩展的 BullMQ（NestJS）风格实现**。

## ✅ 一、目标特性

- 遵循 Nest 官方推荐的 **BullMQ 模块结构**；
- 一个处理器（Processor）只负责一个队列；
- 队列任务类型由内部 `switch` 或分发类处理；
- 事件监听（completed/failed）通过装饰器实现；
- 日志结构清晰；
- 可在任务函数中自由使用依赖注入（如 Service）。

---

## ✅ 二、重构后的代码结构（推荐）

```
src/
├── modules/
│   └── queue/
│       ├── queue.module.ts
│       ├── queue.service.ts         # 生产任务
│       ├── processors/
│       │   ├── default.processor.ts # 默认队列处理器
│       │   ├── import.processor.ts  # 可扩展为单独任务处理类
│       │   └── ...
│       └── types/
│           └── job-types.ts         # 枚举/类型声明
```

---

## ✅ 三、核心文件示例

### 📄 `queue.module.ts`

```ts
import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { DefaultProcessor } from "./processors/default.processor";
import { QueueService } from "./queue.service";

@Module({
    imports: [
        BullModule.forRoot({
            connection: {
                host: "localhost",
                port: 6379,
            },
        }),
        BullModule.registerQueue({
            name: "default",
        }),
    ],
    providers: [DefaultProcessor, QueueService],
    exports: [QueueService],
})
export class QueueModule {}
```

---

### 📄 `queue.service.ts`

> 用于添加任务。服务层与业务逻辑层隔离。

```ts
import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { JobType } from "./types/job-types";

@Injectable()
export class QueueService {
    constructor(@InjectQueue("default") private readonly queue: Queue) {}

    async addGenericTask(data: { duration?: number }) {
        return this.queue.add(JobType.GENERIC, data);
    }

    async addImportTask(items: any[], options?: any) {
        return this.queue.add(JobType.IMPORT, { items, options });
    }
}
```

---

### 📄 `types/job-types.ts`

```ts
export enum JobType {
    GENERIC = "generic",
    IMPORT = "import",
}
```

---

### 📄 `processors/default.processor.ts`

> ✅ 重点：标准的 `@nestjs/bullmq` 写法
>
> - 使用 `WorkerHost`
> - 拆分任务逻辑
> - 结构清晰可维护

```ts
import { Processor, WorkerHost, OnWorkerEvent } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { Logger } from "@nestjs/common";
import { JobType } from "../types/job-types";

@Processor("default")
export class DefaultProcessor extends WorkerHost {
    private readonly logger = new Logger(DefaultProcessor.name);

    /**
     * BullMQ 的核心执行函数
     */
    async process(job: Job): Promise<any> {
        this.logger.log(`➡️  开始任务: ${job.name} (ID: ${job.id})`);
        this.logger.debug(`任务数据: ${JSON.stringify(job.data)}`);

        try {
            switch (job.name) {
                case JobType.GENERIC:
                    return await this.handleGeneric(job);
                case JobType.IMPORT:
                    return await this.handleImport(job);
                default:
                    this.logger.warn(`⚠️ 未知任务类型: ${job.name}`);
                    return { success: false, reason: "Unknown job type" };
            }
        } catch (error) {
            this.logger.error(`❌ 任务处理失败: ${error.message}`, error.stack);
            throw error;
        }
    }

    private async handleGeneric(job: Job<any>) {
        this.logger.log(`处理通用任务: ${job.id}`);
        await this.simulate(job.data.duration || 1000);
        await job.updateProgress(100);
        this.logger.log(`✅ 通用任务完成: ${job.id}`);

        return { success: true, finishedAt: new Date() };
    }

    private async handleImport(job: Job<any>) {
        const { items = [], options } = job.data;
        const total = items.length || 10;

        this.logger.log(`开始导入任务: ${job.id} (${total} 项)`);

        for (let i = 0; i < total; i++) {
            await job.updateProgress(Math.round((i / total) * 100));
            await this.simulate(100);
            this.logger.debug(`已处理 ${i + 1}/${total}`);
        }

        await job.updateProgress(100);
        this.logger.log(`✅ 导入任务完成: ${job.id}`);

        return {
            success: true,
            totalProcessed: total,
            options,
            finishedAt: new Date(),
        };
    }

    private async simulate(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // 可选的 Worker 事件监听器
    @OnWorkerEvent("completed")
    onCompleted(job: Job, result: any) {
        this.logger.log(`🎉 任务完成: ${job.name} (${job.id})`);
    }

    @OnWorkerEvent("failed")
    onFailed(job: Job, err: Error) {
        this.logger.error(`💥 任务失败: ${job.name} (${job.id}) -> ${err.message}`);
    }
}
```

---

## ✅ 四、为什么这样写更「标准」

| 原写法                                               | 新写法                                       |
| ---------------------------------------------------- | -------------------------------------------- |
| 混合使用 `@Process`、`super.create`、Job处理逻辑混乱 | 使用 `WorkerHost` 明确任务入口               |
| 无任务类型定义                                       | 通过 `enum JobType` 统一管理                 |
| Logger 打印格式杂乱                                  | 统一 emoji + 结构化日志输出                  |
| 单文件耦合多逻辑                                     | 任务类型独立方法                             |
| 无返回类型                                           | 显式返回结构 `{ success, data, finishedAt }` |
| 不支持事件监听                                       | 内置 `@OnWorkerEvent`                        |
