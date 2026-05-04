package com.example.budgetapp.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.budgetapp.data.local.TransactionDao
import com.example.budgetapp.data.model.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

class BudgetViewModel(private val dao: TransactionDao) : ViewModel() {

    val transactions: StateFlow<List<TransactionEntity>> = dao.getAllTransactions()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val dailyBudget: StateFlow<DailyBudgetEntity?> = dao.getDailyBudget()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val balances = transactions.map { list ->
        var cash = 0.0
        var bank = 0.0
        list.forEach { 
            val sign = if (it.type == TransactionType.INCOME) 1.0 else -1.0
            if (it.source == TransactionSource.CASH) cash += it.amount * sign
            else bank += it.amount * sign
        }
        Triple(cash, bank, cash + bank)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), Triple(0.0, 0.0, 0.0))

    fun addTransaction(amount: Double, type: TransactionType, category: String, source: TransactionSource, notes: String) {
        viewModelScope.launch {
            dao.insertTransaction(
                TransactionEntity(
                    amount = amount,
                    type = type,
                    category = category,
                    source = source,
                    dateMillis = System.currentTimeMillis(),
                    notes = notes
                )
            )
        }
    }
}
