import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, Download, Plus, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { generateExcel, generatePdf, InvoiceData, PdfMapping, PdfItemMapping } from './utils/generator';

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [excelTemplate, setExcelTemplate] = useState<ArrayBuffer | null>(null);
  const [pdfTemplate, setPdfTemplate] = useState<ArrayBuffer | null>(null);
  const [fontFile, setFontFile] = useState<ArrayBuffer | null>(null);

  const [headerMappings, setHeaderMappings] = useState<PdfMapping[]>([]);
  const [itemMapping, setItemMapping] = useState<PdfItemMapping | null>(null);
  const [grandTotalMapping, setGrandTotalMapping] = useState<PdfMapping | null>(null);

  const [invoiceData, setInvoiceData] = useState<InvoiceData>({
    filename: '',
    date: new Date().toLocaleDateString('ka-GE'),
    invoiceNum: '',
    companyName: '',
    companyId: '',
    address: '',
    items: [
      { name: '', qty: '', price: '' },
    ],
  });

  const [exportPdf, setExportPdf] = useState(true);
  const [exportExcel, setExportExcel] = useState(false);

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const [excelRes, pdfRes, fontRes, configRes] = await Promise.all([
          fetch('./template.xlsx').catch(() => null),
          fetch('./template.pdf').catch(() => null),
          fetch('./font.ttf').catch(() => null),
          fetch('./pdf-coordinates.json').catch(() => null)
        ]);

        const isHtml = (res: Response | null) => res?.headers.get('content-type')?.includes('text/html');

        if (excelRes?.ok && !isHtml(excelRes) &&
            pdfRes?.ok && !isHtml(pdfRes) &&
            fontRes?.ok && !isHtml(fontRes) &&
            configRes?.ok && !isHtml(configRes)) {
          
          setExcelTemplate(await excelRes.arrayBuffer());
          setPdfTemplate(await pdfRes.arrayBuffer());
          setFontFile(await fontRes.arrayBuffer());
          
          const config = await configRes.json();
          if (config.headerMappings) setHeaderMappings(config.headerMappings);
          if (config.itemMapping) setItemMapping(config.itemMapping);
          if (config.grandTotalMapping) setGrandTotalMapping(config.grandTotalMapping);
          
          setIsLoading(false);
        } else {
          setError("Could not load templates. Please ensure template.xlsx, template.pdf, font.ttf, and pdf-coordinates.json are in the public folder.");
          setIsLoading(false);
        }
      } catch (err) {
        setError("An error occurred while loading templates.");
        setIsLoading(false);
      }
    };
    loadTemplates();
  }, []);

  const handleDownloadExcel = async () => {
    if (!excelTemplate) return;
    try {
      const buffer = await generateExcel(excelTemplate, invoiceData);
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = invoiceData.filename ? `${invoiceData.filename}.xlsx` : 'invoice.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating Excel:', error);
      alert('Failed to generate Excel file');
    }
  };

  const handleDownloadPdf = async () => {
    if (!pdfTemplate || !fontFile || !itemMapping || !grandTotalMapping) return;
    try {
      const pdfBytes = await generatePdf(
        pdfTemplate,
        fontFile,
        invoiceData,
        headerMappings,
        itemMapping,
        grandTotalMapping
      );
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = invoiceData.filename ? `${invoiceData.filename}.pdf` : 'invoice.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF file');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin mb-4 text-indigo-600" />
        <p>Loading templates...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-red-50 text-red-600 p-6 rounded-2xl max-w-md w-full border border-red-100 shadow-sm">
          <AlertCircle className="w-10 h-10 mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Setup Required</h2>
          <p className="text-sm opacity-90">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <h1 className="text-lg sm:text-xl font-semibold text-slate-800 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600" />
          Invoice Generator
        </h1>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-6 mt-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="font-medium text-slate-700 border-b pb-2">Header Information</h3>
                
                <div>
                  <label className="block text-sm text-slate-500 mb-1">ფაილის სახელი (Filename)</label>
                  <input 
                    type="text" 
                    value={invoiceData.filename || ''} 
                    onChange={(e) => setInvoiceData({...invoiceData, filename: e.target.value})}
                    placeholder="e.g. სახელი"
                    className="w-full border rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-500 mb-1">ინვოისის ნომერი (Invoice#)</label>
                  <input 
                    type="text" 
                    value={invoiceData.invoiceNum} 
                    onChange={(e) => setInvoiceData({...invoiceData, invoiceNum: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-500 mb-1">კომპანიის სახელი (Company Name)</label>
                  <input 
                    type="text" 
                    value={invoiceData.companyName} 
                    onChange={(e) => setInvoiceData({...invoiceData, companyName: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-500 mb-1">საკადასტრო (Company ID)</label>
                  <input 
                    type="text" 
                    value={invoiceData.companyId} 
                    onChange={(e) => setInvoiceData({...invoiceData, companyId: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-500 mb-1">მისამართი (Address)</label>
                  <input 
                    type="text" 
                    value={invoiceData.address} 
                    onChange={(e) => setInvoiceData({...invoiceData, address: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none" 
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h3 className="font-medium text-slate-700">პროდუქტები (Items)</h3>
                  <button 
                    onClick={() => {
                      if (invoiceData.items.length < 8) {
                        setInvoiceData({...invoiceData, items: [...invoiceData.items, { name: '', qty: '', price: '' }]})
                      } else {
                        alert('მაქსიმუმ 8 პროდუქტის დამატებაა შესაძლებელი.');
                      }
                    }}
                    disabled={invoiceData.items.length >= 8}
                    className="text-sm bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">პროდუქტის დამატება</span>
                    <span className="sm:hidden">დამატება</span>
                  </button>
                </div>
                
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                  {invoiceData.items.map((item, idx) => (
                    <div key={idx} className="bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-200 relative">
                      {idx > 0 && (
                        <button 
                          onClick={() => {
                            const newItems = [...invoiceData.items];
                            newItems.splice(idx, 1);
                            setInvoiceData({...invoiceData, items: newItems});
                          }}
                          className="absolute top-2 right-2 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <div className="space-y-3 sm:space-y-0 sm:grid sm:grid-cols-12 sm:gap-3">
                        <div className="sm:col-span-12">
                          <label className="block text-xs text-slate-500 mb-1">პროდუქტი</label>
                          <input type="text" value={item.name} onChange={(e) => {
                            const newItems = [...invoiceData.items];
                            newItems[idx].name = e.target.value;
                            setInvoiceData({...invoiceData, items: newItems});
                          }} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                        </div>
                        <div className="grid grid-cols-3 gap-2 sm:col-span-12">
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">რაოდენობა</label>
                            <input type="number" value={item.qty} onChange={(e) => {
                              const newItems = [...invoiceData.items];
                              newItems[idx].qty = e.target.value === '' ? '' : Number(e.target.value);
                              setInvoiceData({...invoiceData, items: newItems});
                            }} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">ერთეულის ფასი</label>
                            <input type="number" value={item.price} onChange={(e) => {
                              const newItems = [...invoiceData.items];
                              newItems[idx].price = e.target.value === '' ? '' : Number(e.target.value);
                              setInvoiceData({...invoiceData, items: newItems});
                            }} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">ჯამი</label>
                            <div className="w-full bg-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 font-medium flex items-center h-[38px]">
                              {(item.qty === '' || item.price === '') ? '' : (Number(item.qty) * Number(item.price)).toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="flex justify-between items-center pt-4 border-t">
                  <span className="font-medium text-slate-700">სულ ჯამი:</span>
                  <span className="text-xl font-bold text-indigo-600">
                    {invoiceData.items.reduce((sum, item) => sum + (Number(item.qty || 0) * Number(item.price || 0)), 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-8 border-t border-slate-200">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={exportPdf} 
                      onChange={(e) => setExportPdf(e.target.checked)}
                      className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    />
                    <span className="font-medium text-slate-700">Generate PDF</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={exportExcel} 
                      onChange={(e) => setExportExcel(e.target.checked)}
                      className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    />
                    <span className="font-medium text-slate-700">Generate Excel</span>
                  </label>
                </div>

                <div className="flex gap-3 w-full sm:w-auto">
                  {exportExcel && (
                    <button 
                      onClick={handleDownloadExcel} 
                      className="flex-1 sm:flex-none bg-emerald-600 text-white px-6 py-3 rounded-xl hover:bg-emerald-700 font-medium shadow-sm flex items-center justify-center gap-2"
                    >
                      <Download className="w-5 h-5" />
                      Download Excel
                    </button>
                  )}
                  {exportPdf && (
                    <button 
                      onClick={handleDownloadPdf} 
                      className="flex-1 sm:flex-none bg-indigo-600 text-white px-6 py-3 rounded-xl hover:bg-indigo-700 font-medium shadow-sm flex items-center justify-center gap-2"
                    >
                      <Download className="w-5 h-5" />
                      Download PDF
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
