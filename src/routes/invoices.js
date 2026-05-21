router.put('/:id/pay', authenticate, authorizeEntity('invoices'), authorize(['invoices.edit']), async (req, res) => {
  try {
    const invoiceId = req.params.id;
    
    const [invoiceRows] = await pool.execute('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
    if (invoiceRows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    
    const invoice = invoiceRows[0];
    const totalAmount = parseFloat(invoice.amount);
    
    const [paymentSum] = await pool.execute(
      'SELECT COALESCE(SUM(amount), 0) as total_paid FROM invoice_payments WHERE invoice_id = ?',
      [invoiceId]
    );
    const currentlyPaid = parseFloat(paymentSum[0].total_paid);

    if (currentlyPaid === 0) {
      await pool.execute(
        `INSERT INTO invoice_payments (invoice_id, amount, payment_date, payment_method, notes) 
         VALUES (?, ?, NOW(), 'transfer', 'Full payment')`,
        [invoiceId, totalAmount]
      );
    }

    await pool.execute(
      'UPDATE invoices SET status = ?, paid_at = NOW() WHERE id = ?',
      ['paid', invoiceId]
    );

    res.json({ message: 'Invoice marked as fully paid' });
  } catch (error) {
    console.error('Full pay error:', error);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

router.put('/:id', authenticate, authorizeEntity('invoices'), authorize(['invoices.edit']), async (req, res) => {
  try {
    const { invoice_number, description, amount, due_date, status } = req.body;
    
    await pool.execute(
      'UPDATE invoices SET invoice_number = ?, description = ?, amount = ?, due_date = ?, status = ? WHERE id = ?',
      [invoice_number, description, amount, due_date, status, req.params.id]
    );
    res.json({ message: 'Invoice updated successfully' });
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

router.delete('/:id', authenticate, authorizeEntity('invoices'), authorize(['invoices.delete']), async (req, res) => {
  try {
    await pool.execute('DELETE FROM invoices WHERE id = ?', [req.params.id]);
    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

module.exports = router;
