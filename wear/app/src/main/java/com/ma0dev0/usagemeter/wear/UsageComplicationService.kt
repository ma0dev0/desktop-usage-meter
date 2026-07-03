package com.ma0dev0.usagemeter.wear

import android.app.PendingIntent
import android.content.Intent
import android.graphics.drawable.Icon
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationText
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.MonochromaticImage
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.RangedValueComplicationData
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService

private data class ComplicationMetric(
    val title: String,
    val text: String,
    val description: String,
    val percent: Int?
)

enum class MetricKind {
    CODEX_FIVE_HOUR,
    CLAUDE_SESSION,
    CRITICAL
}

class CodexFiveHourComplicationService : UsageComplicationService(MetricKind.CODEX_FIVE_HOUR)

class ClaudeSessionComplicationService : UsageComplicationService(MetricKind.CLAUDE_SESSION)

class CriticalUsageComplicationService : UsageComplicationService(MetricKind.CRITICAL)

abstract class UsageComplicationService(
    private val metricKind: MetricKind
) : SuspendingComplicationDataSourceService() {

    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
        val repository = UsageRepository(this)
        val payload = when (val result = repository.fetchLatest()) {
            is FetchResult.Success -> result.payload
            is FetchResult.Failure -> repository.cachedPayload()
        }
        val metric = metricFor(payload)

        return when (request.complicationType) {
            ComplicationType.RANGED_VALUE -> rangedData(metric)
            ComplicationType.SHORT_TEXT -> shortTextData(metric)
            else -> shortTextData(metric)
        }
    }

    override fun getPreviewData(type: ComplicationType): ComplicationData {
        val metric = when (metricKind) {
            MetricKind.CODEX_FIVE_HOUR -> ComplicationMetric(
                title = "Codex",
                text = "42%",
                description = "Codex 5時間 使用率 42%",
                percent = 42
            )
            MetricKind.CLAUDE_SESSION -> ComplicationMetric(
                title = "Claude",
                text = "68%",
                description = "Claude セッション 使用率 68%",
                percent = 68
            )
            MetricKind.CRITICAL -> ComplicationMetric(
                title = "Usage",
                text = "68%",
                description = "一番高い使用率 68%",
                percent = 68
            )
        }
        return if (type == ComplicationType.RANGED_VALUE) rangedData(metric) else shortTextData(metric)
    }

    private fun metricFor(payload: UsagePayload?): ComplicationMetric {
        if (payload == null) {
            return ComplicationMetric(
                title = "Usage",
                text = "--",
                description = "Usage Meter データ未取得",
                percent = null
            )
        }

        return when (metricKind) {
            MetricKind.CODEX_FIVE_HOUR -> singleMetric(
                title = "Codex",
                label = "5h",
                percent = payload.codex.sessionPercent
            )
            MetricKind.CLAUDE_SESSION -> singleMetric(
                title = "Claude",
                label = "session",
                percent = payload.claude.sessionPercent
            )
            MetricKind.CRITICAL -> criticalMetric(payload)
        }
    }

    private fun singleMetric(title: String, label: String, percent: Int?): ComplicationMetric {
        val text = percent?.let { "$it%" } ?: "--"
        val description = percent?.let { "$title $label 使用率 $it%" } ?: "$title $label 未取得"
        return ComplicationMetric(
            title = title,
            text = text,
            description = description,
            percent = percent
        )
    }

    private fun criticalMetric(payload: UsagePayload): ComplicationMetric {
        val candidates = listOf(
            Triple("CDX", "Codex 5時間", payload.codex.sessionPercent),
            Triple("CDX W", "Codex 週間", payload.codex.weeklyPercent),
            Triple("CLD", "Claude セッション", payload.claude.sessionPercent),
            Triple("CLD W", "Claude 週間", payload.claude.weeklyPercent)
        )
        val best = candidates
            .filter { it.third != null }
            .maxByOrNull { it.third ?: -1 }

        if (best == null) {
            return ComplicationMetric(
                title = "Usage",
                text = "--",
                description = "Usage Meter データ未取得",
                percent = null
            )
        }

        val percent = best.third ?: 0
        return ComplicationMetric(
            title = best.first,
            text = "$percent%",
            description = "${best.second} 使用率 $percent%",
            percent = percent
        )
    }

    private fun rangedData(metric: ComplicationMetric): RangedValueComplicationData {
        val contentDescription = complicationText(metric.description)
        return RangedValueComplicationData.Builder(
            value = (metric.percent ?: 0).toFloat(),
            min = 0f,
            max = 100f,
            contentDescription = contentDescription
        )
            .setTitle(complicationText(metric.title))
            .setText(complicationText(metric.text))
            .setMonochromaticImage(complicationIcon())
            .setTapAction(openAppIntent())
            .build()
    }

    private fun shortTextData(metric: ComplicationMetric): ShortTextComplicationData {
        val contentDescription = complicationText(metric.description)
        return ShortTextComplicationData.Builder(
            text = complicationText(metric.text),
            contentDescription = contentDescription
        )
            .setTitle(complicationText(metric.title))
            .setMonochromaticImage(complicationIcon())
            .setTapAction(openAppIntent())
            .build()
    }

    private fun complicationText(value: String): ComplicationText {
        return PlainComplicationText.Builder(value).build()
    }

    private fun complicationIcon(): MonochromaticImage {
        return MonochromaticImage.Builder(
            Icon.createWithResource(this, R.drawable.complication_icon)
        ).build()
    }

    private fun openAppIntent(): PendingIntent {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        return PendingIntent.getActivity(
            this,
            metricKind.ordinal,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
}
