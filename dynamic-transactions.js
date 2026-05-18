/**
 * Dynamic Transactions Manager
 * Manages transaction history with local storage
 * Displays transactions with auto-scroll animation
 */

class DynamicTransactionManager {
    constructor() {
        this.storageKey = 'transactionHistory';
        this.maxTransactions = 10;
        this.transactions = this.loadTransactions();
    }

    /**
     * Load transactions from localStorage
     */
    loadTransactions() {
        const stored = localStorage.getItem(this.storageKey);
        return stored ? JSON.parse(stored) : [];
    }

    /**
     * Save transactions to localStorage
     */
    saveTransactions() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.transactions));
    }

    /**
     * Add a new transaction
     * @param {Object} transaction - Transaction object
     * @param {string} transaction.type - Transaction type (recharge, rebate, transfer, etc)
     * @param {number} transaction.amount - Transaction amount
     * @param {string} transaction.description - Transaction description
     * @param {string} transaction.method - Payment method (MTN, Airtel, etc)
     * @param {string} transaction.status - Transaction status (success, pending, failed)
     * @param {string} transaction.userId - Optional user identifier
     */
    addTransaction(transaction) {
        const newTransaction = {
            id: Date.now(),
            timestamp: new Date(),
            ...transaction,
            formattedTime: this.formatTime(new Date())
        };

        // Add to beginning of array
        this.transactions.unshift(newTransaction);

        // Keep only recent transactions
        if (this.transactions.length > this.maxTransactions) {
            this.transactions = this.transactions.slice(0, this.maxTransactions);
        }

        this.saveTransactions();
        return newTransaction;
    }

    /**
     * Get all transactions
     */
    getTransactions() {
        return this.transactions;
    }

    /**
     * Clear all transactions
     */
    clearTransactions() {
        this.transactions = [];
        this.saveTransactions();
    }

    /**
     * Format time for display
     */
    formatTime(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;

        // Format as M-DD HH:mm
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const mins = date.getMinutes().toString().padStart(2, '0');
        return `${month}-${day} ${hours}:${mins}`;
    }

    /**
     * Get transaction icon based on type
     */
    getTransactionIcon(type) {
        const icons = {
            recharge: '💳',
            rebate: '🎁',
            transfer: '📤',
            withdraw: '💰',
            investment: '📈',
            dividend: '💵',
            bonus: '⭐',
            fee: '⚠️'
        };
        return icons[type] || '💫';
    }

    /**
     * Get transaction color based on type
     */
    getTransactionColor(type) {
        const colors = {
            recharge: '#3b82f6',
            rebate: '#10b981',
            transfer: '#f59e0b',
            withdraw: '#ef4444',
            investment: '#8b5cf6',
            dividend: '#06b6d4',
            bonus: '#f97316',
            fee: '#6b7280'
        };
        return colors[type] || '#6b7280';
    }

    /**
     * Format amount for display
     */
    formatAmount(amount) {
        return new Intl.NumberFormat('en-UG', {
            style: 'currency',
            currency: 'UGX',
            minimumFractionDigits: 0
        }).format(amount);
    }
}

/**
 * Dynamic Display Component
 * Renders and animates transaction history
 */
class DynamicDisplay {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.manager = new DynamicTransactionManager();
        this.animationInterval = null;
        this.autoScrollEnabled = true;
    }

    /**
     * Initialize the display
     */
    init() {
        this.renderTransactions();
        this.startAutoScroll();
        this.setupEventListeners();
    }

    /**
     * Render all transactions
     */
    renderTransactions() {
        this.container.innerHTML = '';

        if (this.manager.transactions.length === 0) {
            this.container.innerHTML = `
                <div style="text-align: center; padding: 30px 16px; color: #9ca3af;">
                    <div style="font-size: 32px; margin-bottom: 8px;">📭</div>
                    <div style="font-size: 13px;">No transactions yet</div>
                </div>
            `;
            return;
        }

        const html = this.manager.transactions.map((txn, index) => `
            <div class="dynamic-item" style="animation-delay: ${index * 0.05}s;">
                <div class="icon" style="background-color: ${this.manager.getTransactionColor(txn.type)};">
                    ${this.manager.getTransactionIcon(txn.type)}
                </div>
                <div style="flex: 1;">
                    <div class="text">
                        ${txn.description}
                        <span style="font-weight: 700; color: ${this.manager.getTransactionColor(txn.type)};">
                            ${txn.type === 'withdraw' || txn.type === 'fee' ? '-' : '+'}${this.manager.formatAmount(txn.amount)}
                        </span>
                    </div>
                    <div class="time">${txn.formattedTime}</div>
                </div>
                <div style="font-size: 11px; padding: 4px 8px; border-radius: 4px; 
                    background: ${this.getStatusColor(txn.status, 'bg')}; 
                    color: ${this.getStatusColor(txn.status, 'text')};">
                    ${txn.status}
                </div>
            </div>
        `).join('');

        this.container.innerHTML = html;
    }

    /**
     * Get status color
     */
    getStatusColor(status, type) {
        const colors = {
            success: { text: '#16a34a', bg: '#dcfce7' },
            pending: { text: '#f59e0b', bg: '#fef3c7' },
            failed: { text: '#dc2626', bg: '#fee2e2' }
        };
        const color = colors[status] || colors.pending;
        return type === 'text' ? color.text : color.bg;
    }

    /**
     * Add and display new transaction
     */
    addTransaction(transaction) {
        const newTxn = this.manager.addTransaction(transaction);
        this.renderTransactions();
        return newTxn;
    }

    /**
     * Start auto-scroll animation
     */
    startAutoScroll() {
        if (!this.autoScrollEnabled || !this.container.parentElement) return;

        let scrollPosition = 0;
        const parent = this.container.parentElement;
        const scrollHeight = parent.scrollHeight;
        const viewHeight = parent.clientHeight;

        this.animationInterval = setInterval(() => {
            if (parent.scrollTop < scrollHeight - viewHeight) {
                parent.scrollTop += 2;
            } else {
                parent.scrollTop = 0;
            }
        }, 50);
    }

    /**
     * Stop auto-scroll animation
     */
    stopAutoScroll() {
        if (this.animationInterval) {
            clearInterval(this.animationInterval);
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const parent = this.container.parentElement;
        if (!parent) return;

        parent.addEventListener('mouseenter', () => this.stopAutoScroll());
        parent.addEventListener('mouseleave', () => this.startAutoScroll());
        parent.addEventListener('touchstart', () => this.stopAutoScroll());
        parent.addEventListener('touchend', () => this.startAutoScroll());
    }

    /**
     * Refresh display from storage
     */
    refresh() {
        this.manager.transactions = this.manager.loadTransactions();
        this.renderTransactions();
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DynamicTransactionManager, DynamicDisplay };
}
