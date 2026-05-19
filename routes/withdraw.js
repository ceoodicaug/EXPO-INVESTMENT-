const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient'); // Ensure you have supabase client configured
const authenticateToken = require('../middleware/auth'); // Auth middleware to verify token

// Gateway configuration
const GATEWAY_PHONE = '0780194414';
const GATEWAY_API_URL = 'https://api.gateway.example.com'; // Replace with actual gateway URL

/**
 * POST /withdraw
 * Process withdrawal request
 * Required: userId, amount, phoneNumber, authToken
 */
router.post('/withdraw', authenticateToken, async (req, res) => {
  try {
    const { userId, amount, phoneNumber, authToken } = req.body;

    // Validation
    if (!userId || !amount || !phoneNumber || !authToken) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, amount, phoneNumber, authToken'
      });
    }

    // Validate amount
    if (amount <= 0 || isNaN(amount)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid withdrawal amount'
      });
    }

    // Validate phone number format
    if (!/^\d{10,15}$/.test(phoneNumber.replace(/\D/g, ''))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format'
      });
    }

    // Check user exists and has sufficient balance
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, balance, email')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance for withdrawal'
      });
    }

    // Create withdrawal record with pending status
    const { data: withdrawal, error: withdrawalError } = await supabase
      .from('withdrawals')
      .insert([
        {
          user_id: userId,
          amount: amount,
          phone_number: phoneNumber,
          gateway_phone: GATEWAY_PHONE,
          status: 'processing',
          processed_at: new Date().toISOString(),
          transaction_id: `TXN-${Date.now()}-${userId}`
        }
      ])
      .select()
      .single();

    if (withdrawalError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create withdrawal record',
        error: withdrawalError.message
      });
    }

    // Process payment through gateway
    const gatewayResponse = await processGatewayPayment(
      amount,
      phoneNumber,
      GATEWAY_PHONE,
      withdrawal.transaction_id,
      user.email
    );

    if (!gatewayResponse.success) {
      // Update withdrawal status to failed
      await supabase
        .from('withdrawals')
        .update({ status: 'failed', error_message: gatewayResponse.error })
        .eq('id', withdrawal.id);

      return res.status(400).json({
        success: false,
        message: 'Payment processing failed',
        error: gatewayResponse.error
      });
    }

    // Deduct from user balance
    const { error: balanceError } = await supabase
      .from('users')
      .update({ balance: user.balance - amount })
      .eq('id', userId);

    if (balanceError) {
      // Refund the transaction
      await supabase
        .from('withdrawals')
        .update({ status: 'refunded' })
        .eq('id', withdrawal.id);

      return res.status(500).json({
        success: false,
        message: 'Failed to update balance. Transaction refunded.',
        error: balanceError.message
      });
    }

    // Update withdrawal status to completed
    const { data: completedWithdrawal, error: updateError } = await supabase
      .from('withdrawals')
      .update({
        status: 'completed',
        gateway_reference: gatewayResponse.reference,
        completed_at: new Date().toISOString()
      })
      .eq('id', withdrawal.id)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to complete withdrawal',
        error: updateError.message
      });
    }

    // Log transaction
    await logTransaction(userId, 'withdraw', amount, 'completed', withdrawal.transaction_id);

    res.status(200).json({
      success: true,
      message: 'Withdrawal processed successfully',
      data: {
        transactionId: withdrawal.transaction_id,
        amount: amount,
        phoneNumber: phoneNumber,
        status: 'completed',
        processedAt: completedWithdrawal.completed_at,
        newBalance: user.balance - amount
      }
    });

  } catch (error) {
    console.error('Withdrawal error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * GET /withdraw/history/:userId
 * Get user withdrawal history
 */
router.get('/withdraw/history/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10, offset = 0 } = req.query;

    // Verify user is requesting their own history
    if (req.user.id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    const { data: withdrawals, error, count } = await supabase
      .from('withdrawals')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('processed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch withdrawal history',
        error: error.message
      });
    }

    res.status(200).json({
      success: true,
      data: withdrawals,
      pagination: {
        total: count,
        limit: limit,
        offset: offset
      }
    });

  } catch (error) {
    console.error('Fetch history error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * GET /withdraw/status/:transactionId
 * Check withdrawal status
 */
router.get('/withdraw/status/:transactionId', authenticateToken, async (req, res) => {
  try {
    const { transactionId } = req.params;

    const { data: withdrawal, error } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('transaction_id', transactionId)
      .single();

    if (error || !withdrawal) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal not found'
      });
    }

    // Verify user is checking their own transaction
    if (req.user.id !== withdrawal.user_id) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        transactionId: withdrawal.transaction_id,
        amount: withdrawal.amount,
        status: withdrawal.status,
        phoneNumber: withdrawal.phone_number,
        processedAt: withdrawal.processed_at,
        completedAt: withdrawal.completed_at,
        gatewayReference: withdrawal.gateway_reference
      }
    });

  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * Process payment through gateway
 * @param {number} amount - Withdrawal amount
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} gatewayPhone - Gateway phone number
 * @param {string} transactionId - Transaction ID
 * @param {string} userEmail - User email for notification
 * @returns {Promise<Object>} Gateway response
 */
async function processGatewayPayment(amount, phoneNumber, gatewayPhone, transactionId, userEmail) {
  try {
    // Simulate instant gateway processing
    // In production, replace with actual API call to your gateway
    const response = await fetch(`${GATEWAY_API_URL}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GATEWAY_API_KEY}`
      },
      body: JSON.stringify({
        amount: amount,
        recipientPhone: phoneNumber,
        senderPhone: gatewayPhone,
        transactionId: transactionId,
        userEmail: userEmail,
        timestamp: new Date().toISOString()
      })
    });

    const data = await response.json();

    if (data.success) {
      return {
        success: true,
        reference: data.reference || `REF-${transactionId}`,
        message: 'Payment processed successfully'
      };
    } else {
      return {
        success: false,
        error: data.error || 'Gateway processing failed'
      };
    }

  } catch (error) {
    console.error('Gateway error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Log transaction for audit trail
 */
async function logTransaction(userId, type, amount, status, transactionId) {
  try {
    await supabase
      .from('transaction_logs')
      .insert([
        {
          user_id: userId,
          transaction_type: type,
          amount: amount,
          status: status,
          transaction_id: transactionId,
          created_at: new Date().toISOString()
        }
      ]);
  } catch (error) {
    console.error('Log transaction error:', error);
  }
}

module.exports = router;
