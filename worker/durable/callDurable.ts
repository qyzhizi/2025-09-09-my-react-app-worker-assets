import type { Context } from "hono";
import type { PushGitRepoTaskParams } from "@/types/durable";
import { NotFoundError, ValidationError } from "@/types/error"

const DURABLE_NAME_PREFIX = 'MemoflowDO_'

export const durableHello = async (c: Context) => {
    // Create a `DurableObjectId` for an instance of the `MemoflowDurableObject`
    // class named "foo". Requests from all Workers to the instance named
    // "foo" will go to a single globally unique Durable Object instance.
    const id: DurableObjectId = c.env.MY_DURABLE_OBJECT.idFromName("foo");
    
    // Create a stub to open a communication channel with the Durable
    // Object instance.
    const stub = c.env.MY_DURABLE_OBJECT.get(id);
    
    // Call the `sayHello()` RPC method on the stub to invoke the method on
    // the remote Durable Object instance
    const greeting = await stub.sayHello("world, lzp");
    return c.json({ commitMessage: greeting });
}

export const durableCreateTaskAndSaveArticleToDB = async (c: Context,
    taskParams: Partial<PushGitRepoTaskParams>) => {
    const durableObjectName = `${DURABLE_NAME_PREFIX}${c.get("userId")}`;
    const doId = c.env.MY_DURABLE_OBJECT.idFromName(durableObjectName)
    const stub = c.env.MY_DURABLE_OBJECT.get(doId)

    try {
        // console.log("taskParams: ", taskParams)
        const createdTask = await stub.createTaskAndSaveArticleToDB(taskParams)
        return c.json(createdTask, 201) // 201 Created
        // const greeting = await stub.sayHello("world, lzp");
        // return c.json(greeting, 201) // 201 Created
    } catch (err) {
        if (err instanceof ValidationError) {
            return c.text(err.message, 400)
        }
        if (err instanceof NotFoundError) {
            // 理论上创建任务不会遇到这个，但可保留容错
            return c.text(err.message, 404)
        }

        console.error('Unexpected error in createTaskAndSaveArticleToDB:', err)
        return c.text('Internal Server Error', 500)
    }
}

export const durablePushToGitHub = async (c: Context,
    taskId: string) => {
    const doId = c.env.MY_DURABLE_OBJECT.idFromName(
        `${DURABLE_NAME_PREFIX}${c.get("userId")}`);
    const stub = c.env.MY_DURABLE_OBJECT.get(doId)

    // try {
    //     const result = await stub.processGithubPushTask(taskId)
    //     return result
    // } catch (err) {
    //     if (err instanceof ValidationError) {
    //         return c.text(err.message, 400)
    //     }
    //     if (err instanceof NotFoundError) {
    //         return c.text(err.message, 404)
    //     }

    //     console.error('Unexpected error in processGithubPush:', err)
    //     return c.text('Internal Server Error', 500)
    // }
    
    // 把耗时任务交给 DO，但不阻塞 HTTP 响应
    c.executionCtx.waitUntil(
        stub.processGithubPushTask(taskId)
        .catch((err: any) => {
            // 注意：这里的错误不会再传到用户请求里了，只能自己记录
            console.error("Background DO task failed:", err);
        })
    );

    // 用户立即得到响应，不等任务完成
    return { status: "accepted", taskId };
}

export const getDODatabaseStatus = async (c: Context) => {
    const doId = c.env.MY_DURABLE_OBJECT.idFromName(
        `${DURABLE_NAME_PREFIX}${c.get("userId")}`);
    const stub = c.env.MY_DURABLE_OBJECT.get(doId)

    try {
        const dbStatus = await stub.getDODBStatus()
        return dbStatus
    } catch (err) {
        console.error('Unexpected error in getDODBStatus:', err)
        return c.text('Internal Server Error', 500)
    }
}

export const resetDoKeyStorageAndSqlite = async (c: Context) => {
    const doId = c.env.MY_DURABLE_OBJECT.idFromName(
        `${DURABLE_NAME_PREFIX}${c.get("userId")}`);
    const stub = c.env.MY_DURABLE_OBJECT.get(doId)

    try {
        const resetResult = await stub.resetDoKeyStorageAndSqlite()
        return resetResult
    } catch (err) {
        console.error('Unexpected error in resetDoKeyStorageAndSqlite:', err)
        return c.text('Internal Server Error', 500)
    }
}

export const getArticleContentList = async (c: Context, page: number, pageSize: number) => {
    const doId = c.env.MY_DURABLE_OBJECT.idFromName(
        `${DURABLE_NAME_PREFIX}${c.get("userId")}`);
    const stub = c.env.MY_DURABLE_OBJECT.get(doId)

    try {
        const articleList = await stub.getArticleContentList(page, pageSize)
        return articleList
    } catch (err) {
        console.error('Unexpected error in getArticleContentList:', err)
        return c.text('Internal Server Error', 500)
    }
}
