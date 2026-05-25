import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import ExcelJS from 'exceljs';

export type PdfMapping = {
  id: string;
  pdfX: number;
  pdfY: number;
  fontSize: number;
};

export type PdfItemMapping = {
  pdfStartY: number;
  pdfRowHeight: number;
  cols: {
    name: { pdfX: number };
    qty: { pdfX: number };
    price: { pdfX: number };
    total: { pdfX: number };
  };
};

export type InvoiceData = {
  filename?: string;
  date: string;
  invoiceNum: string;
  companyName: string;
  companyId: string;
  address: string;
  exchangeRate?: number | '';
  items: Array<{ name: string; qty: number | ''; price: number | ''; currency?: 'GEL' | 'USD'; }>;
};

export async function generateExcel(
  templateBytes: ArrayBuffer,
  data: InvoiceData
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBytes);
  const worksheet = workbook.worksheets[0]; // Assuming first sheet

  // D4: Date
  worksheet.getCell('D4').value = data.date;
  
  // D5: Invoice Number
  worksheet.getCell('D5').value = data.invoiceNum;

  // D6: Exchange Rate
  if (data.exchangeRate !== undefined) {
    worksheet.getCell('D6').value = data.exchangeRate;
  }

  // Helper function to append text to a cell that already has a prefix (like "კომპ/სახელი: ")
  const appendToCell = (cellAddress: string, textToAppend: string) => {
    const cell = worksheet.getCell(cellAddress);
    let currentVal = '';
    
    if (cell.value) {
      if (typeof cell.value === 'object' && 'richText' in cell.value) {
        currentVal = cell.value.richText.map(rt => rt.text).join('');
      } else {
        currentVal = cell.value.toString();
      }
    }
    
    // Add a space if the template doesn't already end with one
    const separator = currentVal.endsWith(' ') ? '' : ' ';
    cell.value = currentVal + separator + textToAppend;
  };

  // A12: Company Name
  appendToCell('A12', data.companyName);
  
  // A13: Company ID
  appendToCell('A13', data.companyId);
  
  // A14: Address
  appendToCell('A14', data.address);

  // Items (A17 to A24)
  let grandTotal = 0;
  data.items.forEach((item, index) => {
    const row = 17 + index;
    if (row <= 24) { // Max 8 items (17 to 24)
      const qty = item.qty === '' ? 0 : Number(item.qty);
      const price = item.price === '' ? 0 : Number(item.price);
      const isUsd = item.currency === 'USD';
      const rate = data.exchangeRate === '' || data.exchangeRate === undefined ? 1 : Number(data.exchangeRate);
      
      const itemTotalInOriginalCurrency = qty * price;
      const itemTotalInGel = qty * price * (isUsd ? rate : 1);

      worksheet.getCell(`A${row}`).value = item.name;
      worksheet.getCell(`B${row}`).value = item.qty === '' ? '' : qty;
      worksheet.getCell(`C${row}`).value = item.price === '' ? '' : price;
      worksheet.getCell(`D${row}`).value = (item.qty === '' || item.price === '') ? '' : itemTotalInOriginalCurrency;
      
      grandTotal += itemTotalInGel;
    }
  });

  // D36: Grand Total
  worksheet.getCell('D36').value = grandTotal;

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export async function generatePdf(
  templateBytes: ArrayBuffer,
  fontBytes: ArrayBuffer,
  data: InvoiceData,
  headerMappings: PdfMapping[],
  itemMapping: PdfItemMapping,
  grandTotalMapping: PdfMapping
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(templateBytes);
  
  pdfDoc.registerFontkit(fontkit);
  const customFont = await pdfDoc.embedFont(fontBytes);
  
  const pages = pdfDoc.getPages();
  const page = pages[0];

  // Draw headers
  const dataMap: Record<string, string> = {
    date: data.date,
    invoiceNum: data.invoiceNum,
    companyName: data.companyName,
    companyId: data.companyId,
    address: data.address,
    exchangeRate: data.exchangeRate !== undefined && data.exchangeRate !== '' ? `${data.exchangeRate} ლ` : '',
    exchangeRateLabel: 'დოლარის კურსი',
  };

  headerMappings.forEach((mapping) => {
    if (dataMap[mapping.id]) {
      const text = dataMap[mapping.id];
      if (mapping.id === 'exchangeRateLabel') {
        // Draw 3 times slightly offset horizontally to create a nice bold weight effect (simulated bold)
        for (let offset = 0; offset <= 0.6; offset += 0.3) {
          page.drawText(text, {
            x: mapping.pdfX + offset,
            y: mapping.pdfY,
            size: mapping.fontSize,
            font: customFont,
            color: rgb(0, 0, 0),
          });
        }
      } else {
        page.drawText(text, {
          x: mapping.pdfX,
          y: mapping.pdfY,
          size: mapping.fontSize,
          font: customFont,
          color: rgb(0, 0, 0),
        });
      }
    }
  });

  // Draw items
  let grandTotal = 0;
  data.items.forEach((item, index) => {
    if (index > 7) return; // Max 8 items (17 to 24)
    
    const y = itemMapping.pdfStartY - (index * itemMapping.pdfRowHeight);
    const qty = item.qty === '' ? 0 : Number(item.qty);
    const price = item.price === '' ? 0 : Number(item.price);
    const isUsd = item.currency === 'USD';
    const rate = data.exchangeRate === '' || data.exchangeRate === undefined ? 1 : Number(data.exchangeRate);
    const itemTotalInGel = qty * price * (isUsd ? rate : 1);
    grandTotal += itemTotalInGel;
    
    if (item.name) {
      page.drawText(item.name, {
        x: itemMapping.cols.name.pdfX,
        y,
        size: 10,
        font: customFont,
      });
    }
    
    if (item.qty !== '') {
      const text = qty.toString();
      const textWidth = customFont.widthOfTextAtSize(text, 10);
      page.drawText(text, {
        x: itemMapping.cols.qty.pdfX - (textWidth / 2),
        y,
        size: 10,
        font: customFont,
      });
    }
    
    if (item.price !== '') {
      const text = item.currency === 'USD' ? `${price.toFixed(2)} $` : `${price.toFixed(2)} ლ`;
      const textWidth = customFont.widthOfTextAtSize(text, 10);
      page.drawText(text, {
        x: itemMapping.cols.price.pdfX - (textWidth / 2),
        y,
        size: 10,
        font: customFont,
      });
    }
    
    if (item.qty !== '' && item.price !== '') {
      const itemRowTotal = qty * price;
      const text = item.currency === 'USD' ? `${itemRowTotal.toFixed(2)} $` : `${itemRowTotal.toFixed(2)} ლ`;
      const textWidth = customFont.widthOfTextAtSize(text, 10);
      page.drawText(text, {
        x: itemMapping.cols.total.pdfX - textWidth,
        y,
        size: 10,
        font: customFont,
      });
    }
  });

  // Draw Grand Total
  page.drawText(`${grandTotal.toFixed(2)} ლარი`, {
    x: grandTotalMapping.pdfX,
    y: grandTotalMapping.pdfY,
    size: grandTotalMapping.fontSize,
    font: customFont,
  });

  return await pdfDoc.save();
}
