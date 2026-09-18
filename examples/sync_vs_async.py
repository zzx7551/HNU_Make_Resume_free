# -*- coding: utf-8 -*-
"""FastAPI 同步 def / 异步 async def 的区别 —— 可运行的小实验。

用法（在项目根目录）：
    python examples/sync_vs_async.py

它会：起一个只在 127.0.0.1:8791 监听的临时服务 -> 对三个接口各发 5 个并发请求 -> 打印耗时对比。
每个接口内部都"耗时 1 秒"，所以：
    /sync       同步 def，内部阻塞 1 秒    -> 5 个并发约 1 秒（FastAPI 自动丢线程池）
    /async-ok   异步 def + await 非阻塞等待 -> 5 个并发约 1 秒（事件循环并发）
    /async-bad  异步 def + 内部阻塞调用     -> 5 个并发约 5 秒（事件循环被卡住，被迫排队）
"""
import threading
import time
import urllib.request

import uvicorn
from fastapi import FastAPI

PORT = 8791
app = FastAPI()


# ① 同步 def —— FastAPI 会把它丢到线程池执行，不会阻塞事件循环
@app.get("/sync")
def sync_sleep():
    time.sleep(1)               # 阻塞 1 秒
    return {"ok": True}


# ② 异步 async def + 非阻塞等待 —— 事件循环趁等待的空档去处理别的请求
@app.get("/async-ok")
async def async_ok():
    import asyncio
    await asyncio.sleep(1)      # 主动"让出" 1 秒
    return {"ok": True}


# ③ 反面教材：异步 async def 里写了阻塞调用
@app.get("/async-bad")
async def async_bad():
    time.sleep(1)               # 事件循环被彻底卡住，期间其他请求全部排队
    return {"ok": True}


def hit(path):
    t0 = time.time()
    urllib.request.urlopen("http://127.0.0.1:%d%s" % (PORT, path), timeout=60).read()
    return time.time() - t0


def bench(path, n=5):
    """同时发 n 个请求，返回总耗时。"""
    latencies = []
    lock = threading.Lock()

    def worker():
        d = hit(path)
        with lock:
            latencies.append(d)

    threads = [threading.Thread(target=worker) for _ in range(n)]
    t0 = time.time()
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    total = time.time() - t0
    print("%-12s 并发 %d 个 -> 总耗时 %.2fs    各自耗时: %s" % (
        path, n, total, " ".join("%.2f" % x for x in sorted(latencies))))
    return total


def main():
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="warning"))
    threading.Thread(target=server.run, daemon=True).start()
    for _ in range(50):                      # 等服务起来
        try:
            urllib.request.urlopen("http://127.0.0.1:%d/async-ok" % PORT, timeout=5).read()
            break
        except Exception:
            time.sleep(0.2)

    print("每个请求内部都耗时 1 秒，同时发 5 个请求：\n")
    bench("/sync")
    bench("/async-ok")
    bench("/async-bad")
    print("\n结论：能等待的写法（同步 def 或 async + await）都是并发的；"
          "在 async def 里写阻塞代码会把整个服务拖成串行。")
    server.should_exit = True


if __name__ == "__main__":
    main()