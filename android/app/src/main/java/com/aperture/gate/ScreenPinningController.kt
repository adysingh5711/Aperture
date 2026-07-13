package com.aperture.gate

import android.app.Activity
import android.content.Context

object ScreenPinningController {
    fun requestPinning(activity: Activity) {
        try {
            activity.startLockTask()
        } catch (e: Exception) {
            // Handled gracefully if not supported/allowed by OS config
        }
    }

    fun stopPinning(activity: Activity) {
        try {
            val am = activity.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            val isPinned = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                am.lockTaskModeState != android.app.ActivityManager.LOCK_TASK_MODE_NONE
            } else {
                @Suppress("DEPRECATION")
                am.isInLockTaskMode
            }
            if (isPinned) {
                activity.stopLockTask()
            }
        } catch (e: Exception) {
            // Handled gracefully
        }
    }
}
