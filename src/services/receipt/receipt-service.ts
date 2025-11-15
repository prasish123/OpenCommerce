import escpos from 'escpos';
import USB from 'escpos-usb';
import { log } from '../../shared/logger';
import { config } from '../../shared/config';
import { UnifiedOrder, TenderType } from '../../shared/types';
import { Cart } from '../pos-terminal/cart-service';
import Decimal from 'decimal.js';

/**
 * Receipt Service
 * Handles thermal receipt printing via ESC/POS protocol
 * Supports: Epson, Star, and most ESC/POS compatible printers
 */

interface ReceiptData {
  transactionId: string;
  businessDate: string;
  timestamp: string;
  storeName: string;
  storeAddress: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    extendedPrice: number;
  }>;
  subtotal: number;
  discountTotal?: number;
  taxAmount: number;
  totalAmount: number;
  tenders: Array<{
    type: string;
    amount: number;
    changeAmount?: number;
  }>;
  promotions?: Array<{
    description: string;
    discountAmount: number;
  }>;
}

export class ReceiptService {
  private device: any;
  private printer: any;

  constructor() {
    this.initializePrinter();
  }

  /**
   * Initialize USB thermal printer
   */
  private initializePrinter(): void {
    try {
      // Find USB printer
      const vendorId = parseInt(config.printer?.vendorId || '0x04b8', 16);
      const productId = parseInt(config.printer?.productId || '0x0e15', 16);

      this.device = new USB(vendorId, productId);
      this.printer = new escpos.Printer(this.device);

      log.info('Thermal printer initialized', {
        vendorId: vendorId.toString(16),
        productId: productId.toString(16),
      });
    } catch (error) {
      log.warn('Failed to initialize printer (will continue without printer)', error);
      // Continue without printer - useful for development
    }
  }

  /**
   * Print receipt for completed transaction
   * Returns receipt text for display/simulation
   */
  async printReceipt(receiptData: ReceiptData): Promise<{ printed: boolean; receiptText: string }> {
    const receiptText = this.generateReceiptText(receiptData);

    if (!this.device || !this.printer) {
      log.warn('Printer not available, simulating receipt print');
      this.printToConsole(receiptData);
      return {
        printed: false,
        receiptText,
      };
    }

    try {
      await new Promise<void>((resolve, reject) => {
        this.device.open((err: any) => {
          if (err) {
            reject(err);
            return;
          }

          this.printer
            // Store header
            .align('ct')
            .style('bu')
            .size(2, 2)
            .text(receiptData.storeName)
            .size(1, 1)
            .style('normal')
            .text(receiptData.storeAddress)
            .text(`Phone: ${config.store.phone || ''}`)
            .drawLine()

            // Transaction info
            .align('lt')
            .text(`Date: ${receiptData.businessDate}`)
            .text(`Time: ${receiptData.timestamp}`)
            .text(`Transaction: ${receiptData.transactionId.substring(0, 8)}`)
            .text(`Terminal: ${config.store.terminalId || '1'}`)
            .drawLine()

            // Line items
            .style('b')
            .text('ITEMS')
            .style('normal');

          // Print each item
          for (const item of receiptData.items) {
            this.printer
              .text(item.description)
              .text(
                `  ${item.quantity.toFixed(2)} @ $${item.unitPrice.toFixed(2)}` +
                  ` ${this.padRight('$' + item.extendedPrice.toFixed(2), 10)}`
              );
          }

          this.printer.drawLine();

          // Promotions (if any)
          if (receiptData.promotions && receiptData.promotions.length > 0) {
            this.printer.style('b').text('PROMOTIONS').style('normal');

            for (const promo of receiptData.promotions) {
              this.printer.text(
                `${promo.description}` +
                  ` ${this.padRight('-$' + promo.discountAmount.toFixed(2), 10)}`
              );
            }

            this.printer.drawLine();
          }

          // Totals
          this.printer
            .text(
              this.padRight('Subtotal:', 30) +
                this.padLeft('$' + receiptData.subtotal.toFixed(2), 10)
            );

          if (receiptData.discountTotal && receiptData.discountTotal > 0) {
            this.printer.text(
              this.padRight('Discount:', 30) +
                this.padLeft('-$' + receiptData.discountTotal.toFixed(2), 10)
            );
          }

          this.printer
            .text(
              this.padRight('Tax:', 30) +
                this.padLeft('$' + receiptData.taxAmount.toFixed(2), 10)
            )
            .drawLine()
            .style('bu')
            .size(1, 2)
            .text(
              this.padRight('TOTAL:', 30) +
                this.padLeft('$' + receiptData.totalAmount.toFixed(2), 10)
            )
            .size(1, 1)
            .style('normal')
            .drawLine();

          // Tenders
          this.printer.style('b').text('PAYMENT').style('normal');

          for (const tender of receiptData.tenders) {
            this.printer.text(
              this.padRight(`${tender.type}:`, 30) +
                this.padLeft('$' + tender.amount.toFixed(2), 10)
            );

            if (tender.changeAmount && tender.changeAmount > 0) {
              this.printer.text(
                this.padRight('Change:', 30) +
                  this.padLeft('$' + tender.changeAmount.toFixed(2), 10)
              );
            }
          }

          this.printer.drawLine();

          // Footer
          this.printer
            .align('ct')
            .text('Thank you for your business!')
            .text('Please come again')
            .text('')
            .text('Return Policy: 30 days with receipt')
            .text('Customer Support: ' + (config.store.phone || ''))
            .text('')
            .barcode(receiptData.transactionId, 'CODE39', {
              width: 2,
              height: 50,
            })
            .text('')
            .cut()
            .close(() => {
              log.info('Receipt printed successfully', {
                transactionId: receiptData.transactionId,
              });
              resolve();
            });
        });
      });

      return {
        printed: true,
        receiptText,
      };
    } catch (error) {
      log.error('Receipt printing failed', error);
      // Fallback to console
      this.printToConsole(receiptData);
      return {
        printed: false,
        receiptText,
      };
    }
  }

  /**
   * Print receipt from cart (for in-store transactions)
   */
  async printReceiptFromCart(
    cart: Cart,
    transactionId: string,
    tenders: Array<{ type: TenderType; amount: number; changeAmount?: number }>
  ): Promise<{ printed: boolean; receiptText: string }> {
    const receiptData: ReceiptData = {
      transactionId,
      businessDate: new Date().toLocaleDateString(),
      timestamp: new Date().toLocaleTimeString(),
      storeName: config.store.name,
      storeAddress: config.store.address || '',
      items: cart.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        extendedPrice: item.extendedPrice,
      })),
      subtotal: cart.subtotal,
      discountTotal: cart.promoResult?.discountTotal || 0,
      taxAmount: cart.taxAmount,
      totalAmount: cart.totalAmount,
      tenders: tenders.map((t) => ({
        type: t.type,
        amount: t.amount,
        changeAmount: t.changeAmount,
      })),
      promotions: cart.promoResult?.appliedPromotions.map((p) => ({
        description: p.description,
        discountAmount: p.discountAmount,
      })),
    };

    return await this.printReceipt(receiptData);
  }

  /**
   * Print receipt from order (for online/delivery orders)
   */
  async printReceiptFromOrder(order: UnifiedOrder): Promise<{ printed: boolean; receiptText: string }> {
    const receiptData: ReceiptData = {
      transactionId: order.id,
      businessDate: new Date(order.createdAt || new Date()).toLocaleDateString(),
      timestamp: new Date(order.createdAt || new Date()).toLocaleTimeString(),
      storeName: config.store.name,
      storeAddress: config.store.address || '',
      items: order.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        extendedPrice: item.extendedPrice,
      })),
      subtotal: order.subtotal || 0,
      taxAmount: order.taxAmount || 0,
      totalAmount: order.totalAmount,
      tenders: [
        {
          type: order.channel,
          amount: order.totalAmount,
        },
      ],
    };

    return await this.printReceipt(receiptData);
  }

  /**
   * Open cash drawer (connected to printer)
   */
  async openCashDrawer(): Promise<void> {
    if (!this.device || !this.printer) {
      log.warn('Printer not available, cannot open cash drawer');
      return;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        this.device.open((err: any) => {
          if (err) {
            reject(err);
            return;
          }

          // ESC/POS command to open cash drawer (pulse pin 2)
          this.printer.cashdraw(2).close(() => {
            log.info('Cash drawer opened');
            resolve();
          });
        });
      });
    } catch (error) {
      log.error('Failed to open cash drawer', error);
    }
  }

  /**
   * Print X Report (mid-day sales report)
   */
  async printXReport(reportData: any): Promise<void> {
    if (!this.device || !this.printer) {
      log.warn('Printer not available');
      return;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        this.device.open((err: any) => {
          if (err) {
            reject(err);
            return;
          }

          this.printer
            .align('ct')
            .style('bu')
            .size(2, 2)
            .text('X REPORT')
            .size(1, 1)
            .style('normal')
            .text(reportData.storeName)
            .text(`Date: ${reportData.businessDate}`)
            .text(`Time: ${new Date().toLocaleTimeString()}`)
            .drawLine()
            .align('lt')
            .text(
              this.padRight('Total Sales:', 30) +
                this.padLeft('$' + reportData.totalSales.toFixed(2), 10)
            )
            .text(
              this.padRight('Transaction Count:', 30) +
                this.padLeft(reportData.transactionCount.toString(), 10)
            )
            .text(
              this.padRight('Tax Collected:', 30) +
                this.padLeft('$' + reportData.taxCollected.toFixed(2), 10)
            )
            .drawLine()
            .text('')
            .text('TENDER BREAKDOWN')
            .text(
              this.padRight('Cash:', 30) +
                this.padLeft('$' + (reportData.cashTotal || 0).toFixed(2), 10)
            )
            .text(
              this.padRight('Credit Card:', 30) +
                this.padLeft('$' + (reportData.cardTotal || 0).toFixed(2), 10)
            )
            .drawLine()
            .text('')
            .text('** NOT A Z REPORT **')
            .text('Cash drawer NOT cleared')
            .text('')
            .cut()
            .close(() => {
              log.info('X Report printed');
              resolve();
            });
        });
      });
    } catch (error) {
      log.error('Failed to print X Report', error);
    }
  }

  /**
   * Helper: Pad right
   */
  private padRight(text: string, length: number): string {
    return text.padEnd(length, ' ');
  }

  /**
   * Helper: Pad left
   */
  private padLeft(text: string, length: number): string {
    return text.padStart(length, ' ');
  }

  /**
   * Generate receipt text (for simulation/display)
   */
  private generateReceiptText(receiptData: ReceiptData): string {
    let text = '\n';
    text += '========================================\n';
    text += `       ${receiptData.storeName}\n`;
    text += `       ${receiptData.storeAddress}\n`;
    text += '========================================\n';
    text += `Date: ${receiptData.businessDate}\n`;
    text += `Time: ${receiptData.timestamp}\n`;
    text += `Transaction: ${receiptData.transactionId.substring(0, 8)}\n`;
    text += '========================================\n';
    text += 'ITEMS\n';
    for (const item of receiptData.items) {
      text += `${item.description}\n`;
      text += `  ${item.quantity.toFixed(2)} @ $${item.unitPrice.toFixed(2)}`;
      text += `  $${item.extendedPrice.toFixed(2)}\n`;
    }
    text += '========================================\n';
    if (receiptData.promotions && receiptData.promotions.length > 0) {
      text += 'PROMOTIONS\n';
      for (const promo of receiptData.promotions) {
        text += `${promo.description}  -$${promo.discountAmount.toFixed(2)}\n`;
      }
      text += '========================================\n';
    }
    text += `Subtotal:  $${receiptData.subtotal.toFixed(2)}\n`;
    if (receiptData.discountTotal) {
      text += `Discount: -$${receiptData.discountTotal.toFixed(2)}\n`;
    }
    text += `Tax:       $${receiptData.taxAmount.toFixed(2)}\n`;
    text += '========================================\n';
    text += `TOTAL:     $${receiptData.totalAmount.toFixed(2)}\n`;
    text += '========================================\n';
    text += 'PAYMENT\n';
    for (const tender of receiptData.tenders) {
      text += `${tender.type}:  $${tender.amount.toFixed(2)}\n`;
      if (tender.changeAmount) {
        text += `Change:    $${tender.changeAmount.toFixed(2)}\n`;
      }
    }
    text += '========================================\n';
    text += 'Thank you for your business!\n';
    text += 'Please come again\n';
    text += '\n';
    text += 'Return Policy: 30 days with receipt\n';
    text += '========================================\n';
    return text;
  }

  /**
   * Fallback: Print to console (for development/debugging)
   */
  private printToConsole(receiptData: ReceiptData): void {
    console.log('\n========================================');
    console.log(`       ${receiptData.storeName}`);
    console.log(`       ${receiptData.storeAddress}`);
    console.log('========================================');
    console.log(`Date: ${receiptData.businessDate}`);
    console.log(`Time: ${receiptData.timestamp}`);
    console.log(`Transaction: ${receiptData.transactionId.substring(0, 8)}`);
    console.log('========================================');
    console.log('ITEMS');
    for (const item of receiptData.items) {
      console.log(item.description);
      console.log(
        `  ${item.quantity.toFixed(2)} @ $${item.unitPrice.toFixed(
          2
        )}  $${item.extendedPrice.toFixed(2)}`
      );
    }
    console.log('========================================');
    if (receiptData.promotions && receiptData.promotions.length > 0) {
      console.log('PROMOTIONS');
      for (const promo of receiptData.promotions) {
        console.log(`${promo.description}  -$${promo.discountAmount.toFixed(2)}`);
      }
      console.log('========================================');
    }
    console.log(`Subtotal:  $${receiptData.subtotal.toFixed(2)}`);
    if (receiptData.discountTotal) {
      console.log(`Discount: -$${receiptData.discountTotal.toFixed(2)}`);
    }
    console.log(`Tax:       $${receiptData.taxAmount.toFixed(2)}`);
    console.log('========================================');
    console.log(`TOTAL:     $${receiptData.totalAmount.toFixed(2)}`);
    console.log('========================================');
    console.log('PAYMENT');
    for (const tender of receiptData.tenders) {
      console.log(`${tender.type}:  $${tender.amount.toFixed(2)}`);
      if (tender.changeAmount) {
        console.log(`Change:    $${tender.changeAmount.toFixed(2)}`);
      }
    }
    console.log('========================================');
    console.log('Thank you for your business!');
    console.log('========================================\n');
  }
}
