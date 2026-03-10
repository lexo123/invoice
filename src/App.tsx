import React, { useState, useEffect } from 'react';
import { Upload, FileSpreadsheet, FileText, Settings, Edit3, Download, Plus, Trash2, Type, Info, RefreshCw } from 'lucide-react';
import localforage from 'localforage';
import { generateExcel, generatePdf, InvoiceData, PdfMapping, PdfItemMapping } from './utils/generator';

export default function App() {
  const [step, setStep] = useState(1);
  const [isProductionMode, setIsProductionMode] = useState(false);
  const [excelTemplate, setExcelTemplate] = useState<ArrayBuffer | null>(null);
  const [pdfTemplate, setPdfTemplate] = useState<ArrayBuffer | null>(null);
  const [fontFile, setFontFile] = useState<ArrayBuffer | null>(null);

  // Load mappings from localStorage or use defaults
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

  // Save mappings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('invoiceHeaderMappings', JSON.stringify(headerMappings));
  }, [headerMappings]);

  useEffect(() => {
    localStorage.setItem('invoiceItemMapping', JSON.stringify(itemMapping));
  }, [itemMapping]);

  useEffect(() => {
    localStorage.setItem('invoiceGrandTotalMapping', JSON.stringify(grandTotalMapping));
  }, [grandTotalMapping]);

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

  // Load saved templates on mount
  useEffect(() => {
    const loadSavedTemplates = async () => {
      try {
        // First try to load from public folder (GitHub Pages production mode)
        const [excelRes, pdfRes, fontRes, configRes] = await Promise.all([
          fetch('./template.xlsx').catch(() => null),
          fetch('./template.pdf').catch(() => null),
          fetch('./font.ttf').catch(() => null),
          fetch('./pdf-coordinates.json').catch(() => null)
        ]);

        const isHtml = (res: Response | null) => res?.headers.get('content-type')?.includes('text/html');

        if (excelRes?.ok && !isHtml(excelRes) &&
            pdfRes?.ok && !isHtml(pdfRes) &&
            fontRes?.ok && !isHtml(fontRes)) {
          
          setExcelTemplate(await excelRes.arrayBuffer());
          setPdfTemplate(await pdfRes.arrayBuffer());
          setFontFile(await fontRes.arrayBuffer());
          
          if (configRes?.ok && !isHtml(configRes)) {
            const config = await configRes.json();
            if (config.headerMappings) setHeaderMappings(config.headerMappings);
            if (config.itemMapping) setItemMapping(config.itemMapping);
            if (config.grandTotalMapping) setGrandTotalMapping(config.grandTotalMapping);
          }
          
          setIsProductionMode(true);
          setStep(3);
          return; // Skip loading from localforage
        }

        // Fallback to localforage for local development / setup mode
        const savedExcel = await localforage.getItem<ArrayBuffer>('excelTemplate');
        const savedPdf = await localforage.getItem<ArrayBuffer>('pdfTemplate');
        const savedFont = await localforage.getItem<ArrayBuffer>('fontFile');
        
        if (savedExcel) setExcelTemplate(savedExcel);
        if (savedPdf) setPdfTemplate(savedPdf);
        if (savedFont) setFontFile(savedFont);
      } catch (error) {
        console.error('Error loading saved templates', error);
      }
    };
    loadSavedTemplates();
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

  const clearSavedTemplates = async () => {
    if (window.confirm('Are you sure you want to clear all saved templates?')) {
      await localforage.removeItem('excelTemplate');
      await localforage.removeItem('pdfTemplate');
      await localforage.removeItem('fontFile');
      setExcelTemplate(null);
      setPdfTemplate(null);
      setFontFile(null);
    }
  };

  const handleDownloadPdf = async () => {
    if (!pdfTemplate || !fontFile) {
      alert('გთხოვთ ატვირთოთ PDF და შრიფტის (Font) ფაილები.');
      return;
    }
    try {
      const pdfBytes = await generatePdf(pdfTemplate, fontFile, invoiceData, headerMappings, itemMapping, grandTotalMapping);
      const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const pdfLink = document.createElement('a');
      pdfLink.href = pdfUrl;
      const name = invoiceData.filename ? `${invoiceData.filename}.pdf` : `Invoice_${invoiceData.invoiceNum || 'New'}.pdf`;
      pdfLink.download = name;
      pdfLink.click();
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('შეცდომა PDF ფაილის გენერაციისას. გთხოვთ შეამოწმოთ კონსოლი.');
    }
  };

  const handleDownloadExcel = async () => {
    if (!excelTemplate) {
      alert('გთხოვთ ატვირთოთ Excel ფაილი.');
      return;
    }
    try {
      const excelBuffer = await generateExcel(excelTemplate, invoiceData);
      const excelBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const excelUrl = URL.createObjectURL(excelBlob);
      const excelLink = document.createElement('a');
      excelLink.href = excelUrl;
      const name = invoiceData.filename ? `${invoiceData.filename}.xlsx` : `Invoice_${invoiceData.invoiceNum || 'New'}.xlsx`;
      excelLink.download = name;
      excelLink.click();
    } catch (error) {
      console.error('Error generating Excel:', error);
      alert('შეცდომა Excel ფაილის გენერაციისას. გთხოვთ შეამოწმოთ კონსოლი.');
    }
  };

  const getLabelForId = (id: string) => {
    switch (id) {
      case 'date': return 'თარიღი (Date)';
      case 'invoiceNum': return 'ინვოისის ნომერი (Invoice#)';
      case 'companyName': return 'კომპანიის სახელი (Company Name)';
      case 'companyId': return 'საკადასტრო (Company ID)';
      case 'address': return 'მისამართი (Address)';
      default: return id;
    }
  };

  const exportConfig = () => {
    const config = {
      headerMappings,
      itemMapping,
      grandTotalMapping
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pdf-coordinates.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const config = JSON.parse(event.target?.result as string);
        if (config.headerMappings) setHeaderMappings(config.headerMappings);
        if (config.itemMapping) setItemMapping(config.itemMapping);
        if (config.grandTotalMapping) setGrandTotalMapping(config.grandTotalMapping);
        alert('Coordinates imported successfully!');
      } catch (err) {
        alert('Invalid configuration file.');
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be selected again if needed
    e.target.value = '';
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-lg sm:text-xl font-semibold text-slate-800 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600" />
          Invoice Generator
        </h1>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-6">
        {/* Stepper */}
        <div className="flex items-center justify-between mb-8 overflow-x-auto pb-2">
          {[
            { num: 1, label: 'Templates', icon: Upload },
            { num: 2, label: 'PDF Map', icon: Settings },
            { num: 3, label: 'Data Entry', icon: Edit3 },
            { num: 4, label: 'Generate', icon: Download },
          ].filter(s => !isProductionMode || s.num >= 3).map((s) => (
            <div
              key={s.num}
              className={`flex flex-col sm:flex-row items-center gap-1 sm:gap-2 cursor-pointer min-w-[70px] ${step === s.num ? 'text-indigo-600 font-medium' : 'text-slate-400'}`}
              onClick={() => setStep(s.num)}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${step === s.num ? 'border-indigo-600 bg-indigo-50' : 'border-slate-300'}`}>
                <s.icon className="w-4 h-4" />
              </div>
              <span className="text-xs sm:text-sm text-center">{s.label}</span>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
          {step === 1 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b pb-2 mb-6">
                <h2 className="text-lg font-medium">1. Upload Templates</h2>
                {(excelTemplate || pdfTemplate || fontFile) && (
                  <button 
                    onClick={clearSavedTemplates}
                    className="text-xs sm:text-sm text-red-600 hover:text-red-700 flex items-center gap-1 font-medium"
                  >
                    <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4" />
                    Clear Saved Files
                  </button>
                )}
              </div>
              
              <div className="bg-indigo-50 text-indigo-800 p-4 rounded-xl text-sm flex gap-3 items-start mb-6">
                <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium mb-1">Files are saved automatically!</p>
                  <p className="opacity-90">Once you upload your templates here, they are securely saved in your browser's memory. You won't need to upload them again next time you open the app on this device.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 sm:p-6 text-center hover:bg-slate-50 transition-colors relative">
                  <FileSpreadsheet className="w-8 h-8 mx-auto text-green-600 mb-2" />
                  <p className="font-medium">Excel Template</p>
                  <p className="text-xs sm:text-sm text-slate-500 mb-4">Empty .xlsx file</p>
                  <input type="file" accept=".xlsx" onChange={(e) => handleFileUpload(e, setExcelTemplate, 'excelTemplate')} className="text-xs sm:text-sm w-full" />
                  {excelTemplate && <p className="text-xs text-green-600 mt-2 font-medium bg-green-50 py-1 rounded">✓ Saved in Browser</p>}
                </div>
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 sm:p-6 text-center hover:bg-slate-50 transition-colors relative">
                  <FileText className="w-8 h-8 mx-auto text-red-500 mb-2" />
                  <p className="font-medium">PDF Template</p>
                  <p className="text-xs sm:text-sm text-slate-500 mb-4">Empty PDF form</p>
                  <input type="file" accept=".pdf" onChange={(e) => handleFileUpload(e, setPdfTemplate, 'pdfTemplate')} className="text-xs sm:text-sm w-full" />
                  {pdfTemplate && <p className="text-xs text-green-600 mt-2 font-medium bg-green-50 py-1 rounded">✓ Saved in Browser</p>}
                </div>
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 sm:p-6 text-center hover:bg-slate-50 transition-colors relative">
                  <Type className="w-8 h-8 mx-auto text-blue-500 mb-2" />
                  <p className="font-medium">Georgian Font (.ttf)</p>
                  <p className="text-xs sm:text-sm text-slate-500 mb-4">Required for PDF</p>
                  <input type="file" accept=".ttf" onChange={(e) => handleFileUpload(e, setFontFile, 'fontFile')} className="text-xs sm:text-sm w-full" />
                  {fontFile && <p className="text-xs text-green-600 mt-2 font-medium bg-green-50 py-1 rounded">✓ Saved in Browser</p>}
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <button onClick={() => setStep(2)} className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg hover:bg-indigo-700 w-full sm:w-auto font-medium">Next Step</button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-2 gap-3">
                <h2 className="text-lg font-medium">2. Configure PDF Mappings</h2>
                <div className="flex items-center gap-2">
                  <button onClick={exportConfig} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1">
                    <Download className="w-3 h-3" /> Export
                  </button>
                  <label className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1">
                    <Upload className="w-3 h-3" /> Import
                    <input type="file" accept=".json" onChange={importConfig} className="hidden" />
                  </label>
                </div>
              </div>
              
              <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm flex gap-3 items-start">
                <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium mb-1">How to find PDF Coordinates (X, Y):</p>
                  <ul className="list-disc pl-4 space-y-1 opacity-90">
                    <li>PDF coordinates start at the <strong>bottom-left</strong> corner (0, 0).</li>
                    <li>A standard A4 page is approx <strong>595 wide (X)</strong> and <strong>842 high (Y)</strong>.</li>
                    <li><strong>Best Method:</strong> Guess the numbers, generate the PDF, and adjust them based on where the text lands.</li>
                    <li>Alternatively, use a free online tool like <em>pdfescape.com</em> to measure.</li>
                  </ul>
                </div>
              </div>
              
              <div className="space-y-4">
                <h3 className="font-medium text-slate-700">Header Fields (PDF)</h3>
                <div className="grid grid-cols-1 gap-3">
                  {headerMappings.map((mapping, idx) => (
                    <div key={mapping.id} className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <div className="font-medium text-sm mb-2 text-slate-700">{getLabelForId(mapping.id)}</div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">X (Left to Right)</label>
                          <input type="number" value={mapping.pdfX} onChange={(e) => {
                            const newMappings = [...headerMappings];
                            newMappings[idx].pdfX = Number(e.target.value);
                            setHeaderMappings(newMappings);
                          }} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Y (Bottom to Top)</label>
                          <input type="number" value={mapping.pdfY} onChange={(e) => {
                            const newMappings = [...headerMappings];
                            newMappings[idx].pdfY = Number(e.target.value);
                            setHeaderMappings(newMappings);
                          }} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div className="font-medium text-sm mb-2 text-slate-700">სულ ჯამი (Grand Total)</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">X (Left to Right)</label>
                        <input type="number" value={grandTotalMapping.pdfX} onChange={(e) => {
                          setGrandTotalMapping({...grandTotalMapping, pdfX: Number(e.target.value)});
                        }} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Y (Bottom to Top)</label>
                        <input type="number" value={grandTotalMapping.pdfY} onChange={(e) => {
                          setGrandTotalMapping({...grandTotalMapping, pdfY: Number(e.target.value)});
                        }} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-medium text-slate-700">Table Items Configuration (PDF)</h3>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Start Y (First Row)</label>
                      <input type="number" value={itemMapping.pdfStartY} onChange={(e) => setItemMapping({...itemMapping, pdfStartY: Number(e.target.value)})} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Row Height (Spacing)</label>
                      <input type="number" value={itemMapping.pdfRowHeight} onChange={(e) => setItemMapping({...itemMapping, pdfRowHeight: Number(e.target.value)})} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                  </div>
                  
                  <div className="pt-2">
                    <label className="block text-xs font-medium text-slate-700 mb-2">Column X Coordinates</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Product</label>
                        <input type="number" value={itemMapping.cols.name.pdfX} onChange={(e) => setItemMapping({...itemMapping, cols: {...itemMapping.cols, name: {pdfX: Number(e.target.value)}}})} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Qty</label>
                        <input type="number" value={itemMapping.cols.qty.pdfX} onChange={(e) => setItemMapping({...itemMapping, cols: {...itemMapping.cols, qty: {pdfX: Number(e.target.value)}}})} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Price</label>
                        <input type="number" value={itemMapping.cols.price.pdfX} onChange={(e) => setItemMapping({...itemMapping, cols: {...itemMapping.cols, price: {pdfX: Number(e.target.value)}}})} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Total</label>
                        <input type="number" value={itemMapping.cols.total.pdfX} onChange={(e) => setItemMapping({...itemMapping, cols: {...itemMapping.cols, total: {pdfX: Number(e.target.value)}}})} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-4 gap-4">
                <button onClick={() => setStep(1)} className="text-slate-600 px-4 sm:px-6 py-2.5 rounded-lg hover:bg-slate-100 font-medium order-2 sm:order-1">Back</button>
                <div className="flex flex-col sm:flex-row items-center gap-3 order-1 sm:order-2">
                  <span className="text-xs text-green-600 font-medium bg-green-50 px-3 py-1.5 rounded-md flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" /> Auto-saved to browser
                  </span>
                  <button onClick={() => setStep(3)} className="bg-indigo-600 text-white px-4 sm:px-6 py-2.5 rounded-lg hover:bg-indigo-700 font-medium w-full sm:w-auto">Next Step</button>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-lg font-medium border-b pb-2">3. Enter Invoice Data</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-medium text-slate-700">Header Information</h3>
                  
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
                  <div className="flex items-center justify-between">
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
                      className="text-sm bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-2 rounded-lg font-medium flex items-center gap-1 disabled:opacity-50"
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

              <div className="flex justify-between pt-4">
                {!isProductionMode && (
                  <button onClick={() => setStep(2)} className="text-slate-600 px-4 sm:px-6 py-2.5 rounded-lg hover:bg-slate-100 font-medium">Back</button>
                )}
                <button onClick={() => setStep(4)} className={`bg-indigo-600 text-white px-4 sm:px-6 py-2.5 rounded-lg hover:bg-indigo-700 font-medium ${isProductionMode ? 'ml-auto' : ''}`}>Next Step</button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6 text-center py-8 sm:py-12">
              <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Download className="w-8 h-8" />
              </div>
              <h2 className="text-xl sm:text-2xl font-semibold text-slate-800">Ready to Generate</h2>
              <p className="text-sm sm:text-base text-slate-500 max-w-md mx-auto mb-6 px-4">
                Your data is ready. Select the formats you want to generate and download.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-8">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={exportPdf} 
                    onChange={(e) => setExportPdf(e.target.checked)}
                    className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <span className="font-medium text-slate-700">PDF Format</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={exportExcel} 
                    onChange={(e) => setExportExcel(e.target.checked)}
                    className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <span className="font-medium text-slate-700">Excel Format</span>
                </label>
              </div>
              
              <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 px-4">
                <button onClick={() => setStep(3)} className="text-slate-600 px-6 py-3 rounded-xl hover:bg-slate-100 font-medium w-full sm:w-auto border border-slate-200 sm:border-none">
                  Go Back
                </button>
                
                {exportPdf && (
                  <button 
                    onClick={handleDownloadPdf} 
                    disabled={!pdfTemplate || !fontFile}
                    className="bg-indigo-600 text-white px-8 py-3 rounded-xl hover:bg-indigo-700 font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 w-full sm:w-auto"
                  >
                    <Download className="w-5 h-5" />
                    Download PDF
                  </button>
                )}

                {exportExcel && (
                  <button 
                    onClick={handleDownloadExcel} 
                    disabled={!excelTemplate}
                    className="bg-emerald-600 text-white px-8 py-3 rounded-xl hover:bg-emerald-700 font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 w-full sm:w-auto"
                  >
                    <Download className="w-5 h-5" />
                    Download Excel
                  </button>
                )}
              </div>
              
              {(!excelTemplate || !pdfTemplate || !fontFile) && !isProductionMode && (
                <p className="text-red-500 text-sm mt-4 px-4">
                  ⚠️ Please go back to Step 1 and upload all required templates.
                </p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
