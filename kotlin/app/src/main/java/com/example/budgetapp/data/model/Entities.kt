package com.example.budgetapp.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.UUID

enum class TransactionType { INCOME, EXPENSE }
enum class TransactionSource { CASH, BANK }

@Entity(tableName = "transactions")
data class TransactionEntity(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val amount: Double,
    val type: TransactionType,
    val category: String,
    val source: TransactionSource,
    val dateMillis: Long,
    val notes: String
)

@Entity(tableName = "daily_budget")
data class DailyBudgetEntity(
    @PrimaryKey val id: String = "1",
    val amount: Double,
    val resetHour: Int = 0
)

@Entity(tableName = "settings")
data class SettingsEntity(
    @PrimaryKey val id: String = "1",
    val currency: String = "USD",
    val themeMode: String = "SYSTEM"
)
