package com.example.budgetapp.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.budgetapp.ui.viewmodel.BudgetViewModel
import com.example.budgetapp.data.model.TransactionType

@Composable
fun HomeScreen(viewModel: BudgetViewModel) {
    val transactions by viewModel.transactions.collectAsState()
    val balances by viewModel.balances.collectAsState()
    
    Scaffold(
        topBar = {
            TopAppBar(title = { Text("FinTrack") })
        }
    ) { padding ->
        Column(modifier = Modifier.padding(padding).padding(16.dp)) {
            // Balance Cards
            BalanceRow(balances.first, balances.second, balances.third)
            
            Spacer(modifier = Modifier.height(24.dp))
            
            Text("Recent Transactions", style = MaterialTheme.typography.titleLarge)
            
            LazyColumn(modifier = Modifier.weight(1f)) {
                items(transactions.take(10)) { tx ->
                    TransactionItem(tx)
                }
            }
        }
    }
}

@Composable
fun BalanceRow(cash: Double, bank: Double, total: Double) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Card(modifier = Modifier.weight(1f)) {
            Column(Modifier.padding(12.dp)) {
                Text("Cash", style = MaterialTheme.typography.labelSmall)
                Text("$${String.format("%.2f", cash)}", style = MaterialTheme.typography.titleMedium)
            }
        }
        Card(modifier = Modifier.weight(1f)) {
            Column(Modifier.padding(12.dp)) {
                Text("Bank", style = MaterialTheme.typography.labelSmall)
                Text("$${String.format("%.2f", bank)}", style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}

@Composable
fun TransactionItem(tx: com.example.budgetapp.data.model.TransactionEntity) {
    ListItem(
        headlineContent = { Text(tx.category) },
        supportingContent = { Text(tx.notes) },
        trailingContent = {
            val prefix = if (tx.type == TransactionType.INCOME) "+" else "-"
            Text("$prefix$${tx.amount}")
        }
    )
}
