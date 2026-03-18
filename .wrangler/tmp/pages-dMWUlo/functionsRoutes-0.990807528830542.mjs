import { onRequestPost as __api_telegram_trigger_ts_onRequestPost } from "G:\\ChainReads\\functions\\api\\telegram\\trigger.ts"
import { onRequestPost as __api_telegram_update_ts_onRequestPost } from "G:\\ChainReads\\functions\\api\\telegram\\update.ts"
import { onRequestGet as __api_article__id__ts_onRequestGet } from "G:\\ChainReads\\functions\\api\\article\\[id].ts"
import { onRequestGet as __api_telegram__category__ts_onRequestGet } from "G:\\ChainReads\\functions\\api\\telegram\\[category].ts"
import { onRequestGet as __api_health_ts_onRequestGet } from "G:\\ChainReads\\functions\\api\\health.ts"
import { onRequestGet as __api_news_index_ts_onRequestGet } from "G:\\ChainReads\\functions\\api\\news\\index.ts"
import { onRequestGet as __api_ping_ts_onRequestGet } from "G:\\ChainReads\\functions\\api\\ping.ts"
import { onRequestGet as __api_test_ts_onRequestGet } from "G:\\ChainReads\\functions\\api\\test.ts"
import { onRequest as __api_academic_ts_onRequest } from "G:\\ChainReads\\functions\\api\\academic.ts"
import { onRequest as ___middleware_ts_onRequest } from "G:\\ChainReads\\functions\\_middleware.ts"

export const routes = [
    {
      routePath: "/api/telegram/trigger",
      mountPath: "/api/telegram",
      method: "POST",
      middlewares: [],
      modules: [__api_telegram_trigger_ts_onRequestPost],
    },
  {
      routePath: "/api/telegram/update",
      mountPath: "/api/telegram",
      method: "POST",
      middlewares: [],
      modules: [__api_telegram_update_ts_onRequestPost],
    },
  {
      routePath: "/api/article/:id",
      mountPath: "/api/article",
      method: "GET",
      middlewares: [],
      modules: [__api_article__id__ts_onRequestGet],
    },
  {
      routePath: "/api/telegram/:category",
      mountPath: "/api/telegram",
      method: "GET",
      middlewares: [],
      modules: [__api_telegram__category__ts_onRequestGet],
    },
  {
      routePath: "/api/health",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_health_ts_onRequestGet],
    },
  {
      routePath: "/api/news",
      mountPath: "/api/news",
      method: "GET",
      middlewares: [],
      modules: [__api_news_index_ts_onRequestGet],
    },
  {
      routePath: "/api/ping",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_ping_ts_onRequestGet],
    },
  {
      routePath: "/api/test",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_test_ts_onRequestGet],
    },
  {
      routePath: "/api/academic",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_academic_ts_onRequest],
    },
  {
      routePath: "/",
      mountPath: "/",
      method: "",
      middlewares: [___middleware_ts_onRequest],
      modules: [],
    },
  ]