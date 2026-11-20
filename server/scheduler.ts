import cron from 'node-cron';
import sgMail from '@sendgrid/mail';
import type { IStorage } from './storage';

export function setupScheduledBackup(storage: IStorage) {
  const apiKey = process.env.SENDGRID_API_KEY;
  
  if (!apiKey) {
    console.warn('SENDGRID_API_KEY not found. Scheduled email backups will not work.');
    return;
  }

  sgMail.setApiKey(apiKey);

  // Schedule: Every Saturday at 11:59 PM Hong Kong Time (UTC+8)
  // Cron format: minute hour day-of-month month day-of-week
  // Hong Kong time 11:59 PM = UTC 3:59 PM (15:59)
  // Cron: '59 15 * * 6' means 3:59 PM UTC every Saturday
  const cronExpression = '59 15 * * 6'; // Every Saturday at 3:59 PM UTC (11:59 PM HKT)

  cron.schedule(cronExpression, async () => {
    console.log('Running scheduled backup job...');
    
    try {
      // Get all invoices with items
      const invoices = await storage.getInvoices();
      const invoicesWithItems = await Promise.all(
        invoices.map(async (invoice) => {
          const items = await storage.getInvoiceItems(invoice.id);
          return { ...invoice, items };
        })
      );

      // Create backup data
      const backupData = {
        exportDate: new Date().toISOString(),
        invoices: invoicesWithItems
      };

      const jsonContent = JSON.stringify(backupData, null, 2);
      const base64Content = Buffer.from(jsonContent).toString('base64');

      // Generate filename with current date
      const now = new Date();
      const dateStr = now.getFullYear() + '-' + 
                     String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                     String(now.getDate()).padStart(2, '0');
      const filename = `invoices-backup-${dateStr}.json`;

      // Send email with attachment
      const msg = {
        to: 'hbcheung8z@yahoo.com',
        from: 'kwokwahtyre@biznetvigator.com', // Your verified sender email
        subject: `TyrePro Weekly Backup - ${dateStr}`,
        text: `Automated weekly backup for TyrePro system.\n\nBackup Date: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' })}\nTotal Invoices: ${invoicesWithItems.length}\n\nThis backup file contains all invoice data and can be restored using the Restore function in the Invoice Management page.`,
        html: `
          <h2>TyrePro Weekly Backup</h2>
          <p><strong>Backup Date:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' })}</p>
          <p><strong>Total Invoices:</strong> ${invoicesWithItems.length}</p>
          <p>This backup file contains all invoice data and can be restored using the <strong>Restore</strong> function in the Invoice Management page.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">This is an automated backup email sent every Saturday at 11:59 PM Hong Kong time.</p>
        `,
        attachments: [
          {
            content: base64Content,
            filename: filename,
            type: 'application/json',
            disposition: 'attachment'
          }
        ]
      };

      await sgMail.send(msg);
      console.log(`Backup email sent successfully to hbcheung8z@yahoo.com`);
    } catch (error) {
      console.error('Failed to send scheduled backup email:', error);
    }
  }, {
    timezone: 'Asia/Hong_Kong' // Run in Hong Kong timezone
  });

  console.log('Scheduled backup job initialized: Every Saturday at 11:59 PM Hong Kong time');
}
