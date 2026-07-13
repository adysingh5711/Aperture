package com.aperture.media

import com.aperture.data.MusicItem
import java.util.Random

object MusicQueueBuilder {
    fun buildQueue(
        items: List<MusicItem>,
        seed: Long,
        lastPlayedId: String? = null
    ): List<MusicItem> {
        if (items.isEmpty()) return emptyList()
        if (items.size == 1) return items

        val mutableItems = items.toMutableList()
        val random = Random(seed)

        // Fisher-Yates Shuffle
        for (i in mutableItems.size - 1 downTo 1) {
            val j = random.nextInt(i + 1)
            val temp = mutableItems[i]
            mutableItems[i] = mutableItems[j]
            mutableItems[j] = temp
        }

        // Ensure last played ID is not first in the new queue if there's more than one item
        if (lastPlayedId != null && mutableItems[0].id == lastPlayedId) {
            val swapIndex = 1 + random.nextInt(mutableItems.size - 1)
            val temp = mutableItems[0]
            mutableItems[0] = mutableItems[swapIndex]
            mutableItems[swapIndex] = temp
        }

        return mutableItems
    }
}
