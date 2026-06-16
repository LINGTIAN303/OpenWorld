"""Crawl4AI 微服务 — 基于 FastAPI 的网页抓取服务

提供网页内容抓取能力，支持 markdown / fit_markdown / cleaned_html 三种输出格式。
由 worldsmith-server 通过 PythonBridge 调用。
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from crawl4ai import AsyncWebCrawler

app = FastAPI(title="Crawl4AI Service")

# 允许所有来源的跨域请求
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CrawlRequest(BaseModel):
    """抓取请求体"""
    url: str = Field(..., description="目标网页 URL")
    max_length: int = Field(default=8000, description="内容最大长度，超出则截断")
    output_format: str = Field(default="markdown", description="输出格式：markdown / fit_markdown / cleaned_html")


class CrawlResponse(BaseModel):
    """抓取响应体"""
    url: str
    content: str
    length: int
    truncated: bool
    format: str


# 输出格式到 crawl4ai 结果字段的映射
FORMAT_MAP = {
    "markdown": "markdown",
    "fit_markdown": "fit_markdown",
    "cleaned_html": "cleaned_html",
}

# 全局 crawler 实例，避免每次请求创建/销毁浏览器
_crawler: AsyncWebCrawler | None = None


async def get_crawler() -> AsyncWebCrawler:
    """获取或创建全局 AsyncWebCrawler 实例"""
    global _crawler
    if _crawler is None:
        _crawler = AsyncWebCrawler()
        await _crawler.start()
    return _crawler


@app.on_event("shutdown")
async def shutdown_crawler():
    """服务关闭时清理 crawler 资源"""
    global _crawler
    if _crawler is not None:
        await _crawler.close()
        _crawler = None


@app.get("/health")
async def health():
    """健康检查端点"""
    return {"status": "ok", "service": "crawl4ai"}


@app.post("/crawl", response_model=CrawlResponse)
async def crawl(req: CrawlRequest):
    """抓取指定 URL 的网页内容

    根据 output_format 提取对应字段，超出 max_length 时截断并标记 truncated。
    """
    # 校验输出格式
    field_name = FORMAT_MAP.get(req.output_format)
    if field_name is None:
        # 不支持的格式回退到 markdown
        field_name = "markdown"
        req.output_format = "markdown"

    crawler = await get_crawler()
    result = await crawler.arun(url=req.url)

    # 从结果中提取对应格式的文本
    content = getattr(result, field_name, None) or ""

    # 截断处理
    truncated = len(content) > req.max_length
    if truncated:
        content = content[: req.max_length]

    return CrawlResponse(
        url=req.url,
        content=content,
        length=len(content),
        truncated=truncated,
        format=req.output_format,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8101)
