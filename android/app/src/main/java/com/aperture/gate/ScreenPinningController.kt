package com.aperture.gate

import android.app.Activity

object ScreenPinningController {
    fun requestPinning(activity: Activity) {
        try {
            activity.startLockTask()
        } catch (e: Exception) {
            // Handled gracefully if not supported/allowed by OS config
        }
    }
}
