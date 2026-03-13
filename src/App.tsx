import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, Download, Plus, Trash2, Loader2, AlertCircle, Upload, FileText, Type, Settings, RefreshCw } from 'lucide-react';
import localforage from 'localforage';
import { generateExcel, generatePdf, InvoiceData, PdfMapping, PdfItemMapping } from './utils/generator';

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [setupMode, setSetupMode] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [excelTemplate, setExcelTemplate] = useState<ArrayBuffer | null>(null);
  const [pdfTemplate, setPdfTemplate] = useState<ArrayBuffer | null>(null);
  const [fontFile, setFontFile] = useState<ArrayBuffer | null>(null);

  const [headerMappings, setHeaderMappings] = useState<PdfMapping[]>(() => {
    const saved = localStorage.getItem('invoiceHeaderMappings');
    if (saved) return JSON.parse(saved);
    return [
      { id: 'date', pdfX: 450, pdfY: 720, fontSize: 10 },
      { id: 'invoiceNum', pdfX: 450, pdfY: 700, fontSize: 10 },
      { id: 'companyName', pdfX: 120, pdfY: 600, fontSize: 10 },
      { id: 'companyId', pdfX: 120, pdfY: 580, fontSize: 10 },
      { id: 'address', pdfX: 120, pdfY: 560, fontSize: 10 },
    ];
  });

  const [itemMapping, setItemMapping] = useState<PdfItemMapping>(() => {
    const saved = localStorage.getItem('invoiceItemMapping');
    if (saved) return JSON.parse(saved);
    return {
      pdfStartY: 480,
      pdfRowHeight: 20,
      cols: {
        name: { pdfX: 50 },
        qty: { pdfX: 300 },
        price: { pdfX: 400 },
        total: { pdfX: 500 },
      },
    };
  });

  const [grandTotalMapping, setGrandTotalMapping] = useState<PdfMapping>(() => {
    const saved = localStorage.getItem('invoiceGrandTotalMapping');
    if (saved) return JSON.parse(saved);
    return {
      id: 'grandTotal', pdfX: 500, pdfY: 150, fontSize: 12
    };
  });

  useEffect(() => {
    localStorage.setItem('invoiceHeaderMappings', JSON.stringify(headerMappings));
    localStorage.setItem('invoiceItemMapping', JSON.stringify(itemMapping));
    localStorage.setItem('invoiceGrandTotalMapping', JSON.stringify(grandTotalMapping));
  }, [headerMappings, itemMapping, grandTotalMapping]);

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

  const [configText, setConfigText] = useState('');

  useEffect(() => {
    if (setupMode) {
      setConfigText(JSON.stringify({
        headerMappings,
        itemMapping,
        grandTotalMapping
      }, null, 2));
    }
  }, [setupMode, headerMappings, itemMapping, grandTotalMapping]);

  const handleSaveConfig = () => {
    try {
      const parsed = JSON.parse(configText);
      if (parsed.headerMappings) setHeaderMappings(parsed.headerMappings);
      if (parsed.itemMapping) setItemMapping(parsed.itemMapping);
      if (parsed.grandTotalMapping) setGrandTotalMapping(parsed.grandTotalMapping);
      alert('Coordinates updated successfully! You can now test the PDF.');
    } catch (e) {
      alert('Invalid JSON format. Please check for errors.');
    }
  };

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        // 1. Try to load from public folder
        const baseUrl = import.meta.env.BASE_URL || './';
        const getFile = (name: string) => fetch(`${baseUrl}${name}`).catch(() => null);

        const [excelRes, pdfRes, fontRes, configRes] = await Promise.all([
          getFile('template.xlsx'),
          getFile('template.pdf'),
          getFile('font.ttf'),
          getFile('pdf-coordinates.json')
        ]);

        const isHtml = (res: Response | null) => res?.headers.get('content-type')?.includes('text/html');
        const isOk = (res: Response | null) => res?.ok && !isHtml(res);

        const missingFiles = [];
        if (!isOk(excelRes)) missingFiles.push('template.xlsx');
        if (!isOk(pdfRes)) missingFiles.push('template.pdf');
        if (!isOk(fontRes)) missingFiles.push('font.ttf');

        if (missingFiles.length === 0) {
          
          setExcelTemplate(await excelRes!.arrayBuffer());
          setPdfTemplate(await pdfRes!.arrayBuffer());
          setFontFile(await fontRes!.arrayBuffer());
          
          if (isOk(configRes)) {
            try {
              const config = await configRes!.json();
              if (config.headerMappings) setHeaderMappings(config.headerMappings);
              if (config.itemMapping) setItemMapping(config.itemMapping);
              if (config.grandTotalMapping) setGrandTotalMapping(config.grandTotalMapping);
            } catch (e) {
              console.error("Failed to parse pdf-coordinates.json", e);
            }
          }
          
          setIsLoading(false);
          setSetupMode(false);
          return;
        }

        // 2. If public folder fails, try localforage (browser storage)
        const savedExcel = await localforage.getItem<ArrayBuffer>('excelTemplate');
        const savedPdf = await localforage.getItem<ArrayBuffer>('pdfTemplate');
        const savedFont = await localforage.getItem<ArrayBuffer>('fontFile');
        
        if (savedExcel && savedPdf && savedFont) {
          setExcelTemplate(savedExcel);
          setPdfTemplate(savedPdf);
          setFontFile(savedFont);
          setIsLoading(false);
          setSetupMode(false);
          return;
        }

        // 3. If both fail, show setup mode
        setErrorMsg(`Failed to load: ${missingFiles.join(', ')}. Make sure they are inside the 'public' folder of your repository.`);
        setSetupMode(true);
        setIsLoading(false);

      } catch (err) {
        setErrorMsg("An error occurred while loading templates.");
        setSetupMode(true);
        setIsLoading(false);
      }
    };
    loadTemplates();
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (buffer: ArrayBuffer) => void, storageKey: string) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        if (event.target?.result) {
          const buffer = event.target.result as ArrayBuffer;
          setter(buffer);
          try {
            await localforage.setItem(storageKey, buffer);
          } catch (error) {
            console.error('Error saving template to storage', error);
          }
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

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

  if (setupMode) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 sm:p-6 font-sans">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6 text-amber-600 bg-amber-50 p-4 rounded-xl border border-amber-100">
            <AlertCircle className="w-6 h-6 flex-shrink-0" />
            <div>
              <h2 className="font-semibold">Missing Templates</h2>
              <p className="text-sm opacity-90">{errorMsg}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-8">
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:bg-slate-50 transition-colors">
              <FileSpreadsheet className="w-8 h-8 mx-auto text-green-600 mb-2" />
              <p className="font-medium">Excel Template</p>
              <input type="file" accept=".xlsx" onChange={(e) => handleFileUpload(e, setExcelTemplate, 'excelTemplate')} className="text-xs w-full mt-2" />
              {excelTemplate && <p className="text-xs text-green-600 mt-2 font-medium bg-green-50 py-1 rounded">✓ Uploaded</p>}
            </div>
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:bg-slate-50 transition-colors">
              <FileText className="w-8 h-8 mx-auto text-red-500 mb-2" />
              <p className="font-medium">PDF Template</p>
              <input type="file" accept=".pdf" onChange={(e) => handleFileUpload(e, setPdfTemplate, 'pdfTemplate')} className="text-xs w-full mt-2" />
              {pdfTemplate && <p className="text-xs text-green-600 mt-2 font-medium bg-green-50 py-1 rounded">✓ Uploaded</p>}
            </div>
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:bg-slate-50 transition-colors">
              <Type className="w-8 h-8 mx-auto text-blue-500 mb-2" />
              <p className="font-medium">Georgian Font (.ttf)</p>
              <input type="file" accept=".ttf" onChange={(e) => handleFileUpload(e, setFontFile, 'fontFile')} className="text-xs w-full mt-2" />
              {fontFile && <p className="text-xs text-green-600 mt-2 font-medium bg-green-50 py-1 rounded">✓ Uploaded</p>}
            </div>
          </div>

          <div className="mb-8 border-t border-slate-200 pt-6">
            <h3 className="font-semibold text-slate-800 mb-2">PDF Coordinates (JSON)</h3>
            <p className="text-sm text-slate-500 mb-4">
              Edit the coordinates here to test them live. Once you are happy with the result, copy this JSON and save it as <code>pdf-coordinates.json</code> in your public folder on GitHub.
            </p>
            <textarea
              value={configText}
              onChange={(e) => setConfigText(e.target.value)}
              className="w-full h-64 p-3 font-mono text-sm bg-slate-900 text-slate-50 rounded-xl border border-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <button
              onClick={handleSaveConfig}
              className="mt-3 bg-slate-100 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-200 transition-colors border border-slate-300"
            >
              Apply Coordinates
            </button>
          </div>

          <button 
            onClick={() => setSetupMode(false)}
            disabled={!excelTemplate || !pdfTemplate || !fontFile}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors"
          >
            Continue to App
          </button>
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
        <button 
          onClick={() => setSetupMode(true)}
          className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 bg-slate-100 px-3 py-1.5 rounded-md"
        >
          <Settings className="w-3 h-3" /> Settings
        </button>
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
