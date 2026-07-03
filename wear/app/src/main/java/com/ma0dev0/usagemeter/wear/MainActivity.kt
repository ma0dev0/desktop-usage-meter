package com.ma0dev0.usagemeter.wear

import android.app.Activity
import android.graphics.Color as AndroidColor
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant
import kotlin.math.ceil

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                UsageMeterApp()
            }
        }
    }
}

data class UsageScreenState(
    val payload: UsagePayload?,
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

@Composable
fun UsageMeterApp() {
    val context = LocalContext.current
    val repository = remember { UsageRepository(context) }
    val scope = rememberCoroutineScope()
    var now by remember { mutableStateOf(Instant.now()) }
    var state by remember {
        mutableStateOf(UsageScreenState(payload = repository.cachedPayload()))
    }

    fun refresh() {
        scope.launch {
            state = state.copy(isLoading = true, errorMessage = null)
            when (val result = repository.fetchLatest()) {
                is FetchResult.Success -> {
                    state = UsageScreenState(payload = result.payload)
                }
                is FetchResult.Failure -> {
                    state = state.copy(isLoading = false, errorMessage = result.message)
                }
            }
        }
    }

    LaunchedEffect(Unit) {
        refresh()
    }
    LaunchedEffect(Unit) {
        while ((context as? Activity)?.isFinishing != true) {
            delay(30_000)
            now = Instant.now()
        }
    }

    UsageMeterScreen(
        state = state,
        now = now,
        onRefresh = { refresh() }
    )
}

@Composable
fun UsageMeterScreen(
    state: UsageScreenState,
    now: Instant,
    onRefresh: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
    ) {
        TimeText()
        val payload = state.payload
        if (payload == null && !state.isLoading) {
            EmptyState(message = state.errorMessage ?: "データを取得できませんでした")
            return@Box
        }

        ScalingLazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 14.dp, end = 14.dp, top = 28.dp, bottom = 10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            item {
                Header(
                    updatedAt = payload?.updatedAt,
                    loading = state.isLoading,
                    errorMessage = state.errorMessage,
                    now = now,
                    onRefresh = onRefresh
                )
            }
            item {
                ProviderUsageBlock(
                    title = "Codex",
                    usage = payload?.codex,
                    fallbackColor = Color(0xFF10A37F),
                    now = now
                )
            }
            item {
                ProviderUsageBlock(
                    title = "Claude",
                    usage = payload?.claude,
                    fallbackColor = Color(0xFFD97757),
                    now = now
                )
            }
        }
    }
}

@Composable
fun EmptyState(message: String) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 18.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = message,
            color = Color(0xFFE7E7EA),
            fontSize = 13.sp,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
fun Header(
    updatedAt: Instant?,
    loading: Boolean,
    errorMessage: String?,
    now: Instant,
    onRefresh: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = if (errorMessage != null) errorMessage else if (loading) "更新中" else "Usage Meter",
                color = if (errorMessage != null) Color(0xFFFFB4A8) else Color(0xFFEDEDF0),
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = "最終更新 ${relativeTime(updatedAt, now)}",
                color = Color(0xFF9A9AA2),
                fontSize = 10.sp,
                maxLines = 1
            )
        }
        Button(
            onClick = onRefresh,
            enabled = !loading,
            modifier = Modifier.size(38.dp),
            colors = ButtonDefaults.buttonColors(
                backgroundColor = Color(0xFF232329),
                contentColor = Color(0xFFEDEDF0),
                disabledBackgroundColor = Color(0xFF151519),
                disabledContentColor = Color(0xFF777780)
            )
        ) {
            Text(text = "↻", fontSize = 17.sp)
        }
    }
}

@Composable
fun ProviderUsageBlock(
    title: String,
    usage: ServiceUsage?,
    fallbackColor: Color,
    now: Instant
) {
    val accent = parseColor(usage?.color, fallbackColor)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(Color(0xFF111115))
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text(
            text = title,
            color = Color(0xFFEDEDF0),
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1
        )
        LimitRow(
            label = usage?.sessionLabel ?: if (title == "Codex") "5時間" else "セッション",
            percent = usage?.sessionPercent,
            resetAt = usage?.sessionResetAt,
            accent = accent,
            now = now
        )
        LimitRow(
            label = "週間",
            percent = usage?.weeklyPercent,
            resetAt = usage?.weeklyResetAt,
            accent = accent.copy(alpha = 0.82f),
            now = now
        )
        if (!usage?.refreshError.isNullOrBlank()) {
            Text(
                text = usage?.refreshError ?: "",
                color = Color(0xFFFFB4A8),
                fontSize = 9.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
fun LimitRow(
    label: String,
    percent: Int?,
    resetAt: Instant?,
    accent: Color,
    now: Instant
) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = label,
                color = Color(0xFFBDBDC5),
                fontSize = 10.sp,
                modifier = Modifier.weight(1f),
                maxLines = 1
            )
            Text(
                text = percent?.let { "$it%" } ?: "--%",
                color = Color(0xFFEDEDF0),
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.size(6.dp))
            Text(
                text = resetRemaining(resetAt, now),
                color = Color(0xFF8F8F98),
                fontSize = 9.sp,
                maxLines = 1
            )
        }
        UsageBar(percent = percent, color = accent)
    }
}

@Composable
fun UsageBar(percent: Int?, color: Color) {
    val fraction = ((percent ?: 0).coerceIn(0, 100)) / 100f
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(4.dp)
            .clip(RoundedCornerShape(99.dp))
            .background(Color(0xFF2A2A31))
    ) {
        Box(
            modifier = Modifier
                .fillMaxHeight()
                .fillMaxWidth(fraction)
                .clip(RoundedCornerShape(99.dp))
                .background(color)
        )
    }
}

private fun parseColor(hex: String?, fallback: Color): Color {
    if (hex.isNullOrBlank()) return fallback
    return try {
        Color(AndroidColor.parseColor(hex))
    } catch (error: IllegalArgumentException) {
        fallback
    }
}

private fun resetRemaining(resetAt: Instant?, now: Instant): String {
    if (resetAt == null) return "残り--"
    val remaining = Duration.between(now, resetAt)
    if (remaining.isNegative || remaining.isZero) return "reset済"
    val totalMinutes = ceil(remaining.seconds / 60.0).toLong().coerceAtLeast(1)
    val hours = totalMinutes / 60
    val minutes = totalMinutes % 60
    return if (hours > 0) {
        "${hours}h${minutes.toString().padStart(2, '0')}m"
    } else {
        "${minutes}m"
    }
}

private fun relativeTime(updatedAt: Instant?, now: Instant): String {
    if (updatedAt == null) return "--"
    val minutes = Duration.between(updatedAt, now).toMinutes()
    if (minutes < 1) return "たった今"
    if (minutes < 60) return "${minutes}分前"
    val hours = minutes / 60
    if (hours < 24) return "${hours}時間前"
    val days = hours / 24
    return "${days}日前"
}
