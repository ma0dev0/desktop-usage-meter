package com.ma0dev0.usagemeter.wear

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.time.OffsetDateTime

data class ServiceUsage(
    val name: String,
    val color: String,
    val sessionLabel: String,
    val sessionPercent: Int?,
    val weeklyPercent: Int?,
    val sessionResetAt: Instant?,
    val weeklyResetAt: Instant?,
    val refreshError: String?
)

data class UsagePayload(
    val codex: ServiceUsage,
    val claude: ServiceUsage,
    val updatedAt: Instant?
)

sealed class FetchResult {
    data class Success(val payload: UsagePayload) : FetchResult()
    data class Failure(val message: String) : FetchResult()
}

class UsageRepository(context: Context) {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("usage_meter_cache", Context.MODE_PRIVATE)

    fun cachedPayload(): UsagePayload? {
        return prefs.getString("latest_json", null)?.let { parsePayloadOrNull(it) }
    }

    suspend fun fetchLatest(): FetchResult = withContext(Dispatchers.IO) {
        val apiUrl = BuildConfig.USAGE_API_URL.trim()
        val apiKey = BuildConfig.USAGE_API_KEY.trim()
        if (apiUrl.isEmpty() || apiKey.isEmpty()) {
            return@withContext FetchResult.Failure("API設定がありません")
        }

        try {
            val connection = (URL(apiUrl).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 8_000
                readTimeout = 8_000
                setRequestProperty("authorization", "Bearer $apiKey")
                setRequestProperty("x-api-key", apiKey)
                setRequestProperty("accept", "application/json")
            }

            val code = connection.responseCode
            if (code !in 200..299) {
                return@withContext FetchResult.Failure("更新失敗")
            }

            val json = connection.inputStream.bufferedReader().use { it.readText() }
            val payload = parsePayloadOrNull(json)
                ?: return@withContext FetchResult.Failure("データ形式が不正です")
            prefs.edit().putString("latest_json", json).apply()
            FetchResult.Success(payload)
        } catch (error: IOException) {
            FetchResult.Failure("更新失敗")
        } catch (error: RuntimeException) {
            FetchResult.Failure("更新失敗")
        }
    }

    private fun parsePayloadOrNull(json: String): UsagePayload? {
        return try {
            val root = JSONObject(json)
            UsagePayload(
                codex = root.optJSONObject("codex").toServiceUsage(
                    fallbackName = "Codex",
                    fallbackColor = "#10A37F",
                    fallbackSessionLabel = "5時間"
                ),
                claude = root.optJSONObject("claude").toServiceUsage(
                    fallbackName = "Claude",
                    fallbackColor = "#D97757",
                    fallbackSessionLabel = "セッション"
                ),
                updatedAt = parseInstant(root.optNullableString("updatedAt"))
            )
        } catch (error: RuntimeException) {
            null
        }
    }
}

private fun JSONObject?.toServiceUsage(
    fallbackName: String,
    fallbackColor: String,
    fallbackSessionLabel: String
): ServiceUsage {
    val obj = this
    return ServiceUsage(
        name = obj?.optNullableString("name") ?: fallbackName,
        color = obj?.optNullableString("color") ?: fallbackColor,
        sessionLabel = obj?.optNullableString("sessionLabel") ?: fallbackSessionLabel,
        sessionPercent = obj?.optNullableInt("sessionPercent"),
        weeklyPercent = obj?.optNullableInt("weeklyPercent"),
        sessionResetAt = parseInstant(obj?.optNullableString("sessionResetAt")),
        weeklyResetAt = parseInstant(obj?.optNullableString("weeklyResetAt")),
        refreshError = obj?.optNullableString("refreshError")
    )
}

private fun JSONObject.optNullableString(name: String): String? {
    if (!has(name) || isNull(name)) return null
    return optString(name).takeIf { it.isNotBlank() }
}

private fun JSONObject.optNullableInt(name: String): Int? {
    if (!has(name) || isNull(name)) return null
    return optInt(name).coerceIn(0, 100)
}

private fun parseInstant(value: String?): Instant? {
    if (value.isNullOrBlank()) return null
    return try {
        Instant.parse(value)
    } catch (instantError: RuntimeException) {
        try {
            OffsetDateTime.parse(value).toInstant()
        } catch (offsetError: RuntimeException) {
            null
        }
    }
}
