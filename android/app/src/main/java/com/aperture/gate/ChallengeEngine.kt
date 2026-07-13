package com.aperture.gate

import java.util.Random

class ChallengeEngine(seed: Long, difficultyStr: String) {
    private val difficulty = when (difficultyStr.lowercase()) {
        "light" -> Difficulty.LIGHT
        "hard" -> Difficulty.HARD
        else -> Difficulty.STANDARD
    }

    private val random = Random(seed)
    val steps: List<ChallengeStep> = generateSteps()

    data class ChallengeStep(
        val operandA: Long,
        val operation: Char, // +, -, ×, ÷
        val operandB: Long,
        val correctAnswer: Long
    )

    enum class Difficulty(val stepCount: Int, val minDigits: Int, val maxDigits: Int) {
        LIGHT(3, 2, 3),
        STANDARD(5, 3, 5),
        HARD(6, 4, 6)
    }

    private fun generateSteps(): List<ChallengeStep> {
        val list = mutableListOf<ChallengeStep>()
        for (i in 0 until difficulty.stepCount) {
            list.add(generateStep())
        }
        return list
    }

    private fun generateStep(): ChallengeStep {
        val ops = listOf('+', '-', '×', '÷')
        val op = ops[random.nextInt(ops.size)]

        val minVal = Math.pow(10.0, (difficulty.minDigits - 1).toDouble()).toLong()
        val maxVal = (Math.pow(10.0, difficulty.maxDigits.toDouble()) - 1).toLong()

        when (op) {
            '+' -> {
                val a = nextRandomLong(minVal, maxVal)
                val b = nextRandomLong(minVal, maxVal)
                return ChallengeStep(a, '+', b, a + b)
            }
            '-' -> {
                var a = nextRandomLong(minVal, maxVal)
                var b = nextRandomLong(minVal, maxVal)
                if (a < b) {
                    val tmp = a
                    a = b
                    b = tmp
                }
                return ChallengeStep(a, '-', b, a - b)
            }
            '×' -> {
                // Keep product within 6 digits max
                val a = nextRandomLong(2, 99)
                val b = nextRandomLong(2, 999)
                return ChallengeStep(a, '×', b, a * b)
            }
            '÷' -> {
                // To guarantee integer division: dividend = divisor * answer
                val divisor = nextRandomLong(2, 99)
                val answer = nextRandomLong(minVal / 10 + 1, maxVal / 100 + 1)
                val dividend = divisor * answer
                return ChallengeStep(dividend, '÷', divisor, answer)
            }
            else -> {
                return ChallengeStep(100, '+', 200, 300)
            }
        }
    }

    private fun nextRandomLong(min: Long, max: Long): Long {
        if (min >= max) return min
        val range = max - min + 1
        return min + (Math.abs(random.nextLong()) % range)
    }

    fun getStep(index: Int): ChallengeStep? {
        if (index < 0 || index >= steps.size) return null
        return steps[index]
    }

    fun checkAnswer(index: Int, submitted: Long): Boolean {
        val step = getStep(index) ?: return false
        return step.correctAnswer == submitted
    }

    val totalSteps: Int
        get() = difficulty.stepCount
}
