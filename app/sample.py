# -*- coding: utf-8 -*-
"""默认简历模板数据。

版式（字号/间距/栏宽…）完全按参考成品图标定；
内容为**通用示例信息**（张三 / 某某大学 / 某某公司），方便一眼看出模板效果，
用户直接在其上改写即可。
"""


def _t(label, value):
    return {"type": "text", "label": label, "value": value}


def _li(value, marker="+"):
    return {"type": "list", "marker": marker, "value": value}


def _en(time, title, mid, right, details=None):
    return {"type": "entry", "time": time, "title": title, "mid": mid, "right": right,
            "details": details or []}


def default_theme() -> dict:
    """与参考成品图标定一致的版式参数。"""
    return {
        "fontFamily": "Microsoft YaHei",
        "fontSize": 13.5,
        "lineHeight": 21,
        "textColor": "#000000",
        "ruleColor": "#333333",
        "padX": 52,
        "padY": 27,
        "nameSize": 28,
        "titleSize": 17,
        "infoSize": 14,
        "sectionGap": 16.5,
        "firstGap": 22,
        "titleIndent": 4,
        "bodyGap": 14,
        "entryAlign": "left",
        "photoWidth": 117,
        "photoHeight": 112,
        "photoGap": 20,
    }


def sample_resume() -> dict:
    """默认简历：示例内容 + 与参考模板一致的版式与模块结构。"""
    return {
        "name": "我的简历",
        "basics": {
            "name": "张三",
            "photo": "/data/sample/avatar-default.png",
            "showPhoto": True,
            "info": [
                {"label": "手机", "value": "13800000000", "visible": True},
                {"label": "邮箱", "value": "zhangsan@example.com", "visible": True},
                {"label": "性别", "value": "男", "visible": True},
                {"label": "学历", "value": "本科", "visible": True},
                {"label": "户籍", "value": "北京", "visible": True},
                {"label": "求职意向", "value": "后端开发", "visible": True},
            ],
        },
        "sections": [
            {
                "id": "edu", "title": "教育经历", "visible": True,
                "items": [
                    _en("2021.09-2025.06", "某某大学", "本科",
                        "计算机科学与技术（国家级一流本科专业建设点）",
                        [
                            _t("成绩排名", "平均绩点 3.6/4.0，专业排名前 10%，连续三年获校级奖学金。"),
                            _t("主修课程", "数据结构、操作系统、计算机网络、数据库原理、软件工程、"
                                          "Java 程序设计、编译原理。"),
                            _t("语言能力", "CET-4、CET-6。"),
                            _t("荣誉奖励", "2024 年大学生计算机设计大赛省赛一等奖；"
                                          "2023-2024 年度优秀学生干部。"),
                        ]),
                ],
            },
            {
                "id": "skill", "title": "个人技能", "visible": True,
                "items": [
                    _li("熟悉 Java 基础与常用设计模式，了解 JVM 内存模型与常见调优手段。", "auto"),
                    _li("熟悉 Spring Boot、MyBatis，了解 Spring Cloud 微服务组件与分布式配置。", "auto"),
                    _li("熟悉 MySQL 索引与事务原理，了解 Redis 缓存常见使用场景。", "auto"),
                    _li("熟悉 Git、Maven 等开发与项目管理工具，了解 Linux 常用命令。", "auto"),
                    _li("熟悉多线程与并发编程基础，了解消息队列在削峰填谷中的应用。", "auto"),
                    _li("具备良好的沟通协作能力，能独立完成模块的设计、开发与自测。", "auto"),
                ],
            },
            {
                "id": "intern", "title": "实习经历", "visible": True,
                "items": [
                    _en("2024.07-2024.09", "某某科技有限公司", "", "后端开发实习生",
                        [
                            _t("项目名称", "企业内部工单管理系统"),
                            _t("项目描述", "基于 Spring Boot + Vue3 的内部工单流转系统，支持工单创建、"
                                          "流转、催办与统计报表，服务公司内部 20 余个团队。"),
                            _t("工作内容", ""),
                            _li("参与工单核心接口开发，完成 8 个 REST 接口及对应单元测试，"
                                "接口一次性测试通过率 95%。"),
                            _li("排查线上慢查询，通过索引与 SQL 优化将列表接口平均响应时间"
                                "从 800ms 降至 220ms。"),
                        ]),
                ],
            },
            {
                "id": "work", "title": "工作经历", "visible": True,
                "items": [
                    _en("2025.07-至今", "某某网络科技有限公司", "", "Java 开发工程师",
                        [
                            _li("负责用户中心模块的设计与开发，支撑日均 200 万次请求，"
                                "服务可用性保持在 99.95%。"),
                            _li("参与订单系统重构，拆分核心链路并引入缓存，接口平均响应时间"
                                "由 320ms 降至 110ms。"),
                            _li("参与线上问题排查与值班，输出问题复盘文档，推动 6 项稳定性改进落地。"),
                        ]),
                ],
            },
            {
                "id": "project", "title": "项目经历", "visible": True,
                "items": [
                    _en("2025.03-2025.06", "分布式任务调度平台", "", "核心开发",
                        [
                            _t("技术栈", "Spring Boot、Quartz、Redis、MySQL、Docker"),
                            _t("项目描述", "面向内部业务的分布式定时任务调度平台，支持任务分片、"
                                          "失败重试、告警与可视化运维。"),
                            _t("工作内容", ""),
                            _li("基于 Redis 实现分布式锁与任务分片，保证多节点部署下同一任务"
                                "不会被重复执行。"),
                            _li("设计失败重试与告警机制，任务失败率由 3% 降至 0.2%。"),
                            _li("基于 Vue3 搭建任务管理前端，支持任务可视化配置与执行日志查看。"),
                        ]),
                    _en("2024.11-2025.01", "校园二手交易平台", "", "全栈开发",
                        [
                            _t("技术栈", "Spring Boot、MyBatis-Plus、MySQL、Vue3、Nginx"),
                            _t("项目描述", "面向校园场景的二手物品交易平台，支持商品发布、搜索、"
                                          "下单与站内消息。"),
                            _t("工作内容", ""),
                            _li("负责商品与订单模块后端开发，设计 12 张核心数据表并完成前后端联调。"),
                            _li("基于 Redis 缓存热点商品数据，首页加载耗时降低约 45%。"),
                        ]),
                ],
            },
        ],
        "theme": default_theme(),
    }


def blank_resume() -> dict:
    """全空白模板（模块骨架保留，内容为空），需要从零开始填时可用。"""
    data = sample_resume()
    data["basics"] = {
        "name": "", "photo": "", "showPhoto": False,
        "info": [
            {"label": "手机", "value": "", "visible": True},
            {"label": "邮箱", "value": "", "visible": True},
            {"label": "性别", "value": "", "visible": True},
            {"label": "学历", "value": "", "visible": True},
            {"label": "求职意向", "value": "", "visible": True},
        ],
    }
    for sec in data["sections"]:
        sec["items"] = [_en("", "", "", "", [_t("", ""), _t("", "")])]
    return data
