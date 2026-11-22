import type { Product } from 'src/api/firestore/products';
import type { ParsedImportRow } from 'src/utils/product-import-export';

import { useRef, useMemo, useState } from 'react';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Switch from '@mui/material/Switch';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Divider from '@mui/material/Divider';
import TableRow from '@mui/material/TableRow';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import TableContainer from '@mui/material/TableContainer';
import FormControlLabel from '@mui/material/FormControlLabel';

import { fCurrency } from 'src/utils/format-number';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';
import { getEffectiveProductPrice } from 'src/utils/product-pricing';
import {
  exportProductsToJson,
  parseImportedProducts,
  buildProductImportTemplateCsv,
} from 'src/utils/product-import-export';

import { varAlpha } from 'src/theme/styles';
import { createProduct, updateProduct } from 'src/api/firestore/products';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------

type Props = {
  open: boolean;
  enterpriseId: string;
  existingProducts: Product[];
  onClose: () => void;
  onImported: () => Promise<void> | void;
};

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ProductImportDialog({
  open,
  enterpriseId,
  existingProducts,
  onClose,
  onImported,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [updateExistingBySku, setUpdateExistingBySku] = useState(true);
  const [importing, setImporting] = useState(false);

  const existingBySku = useMemo(() => {
    const map = new Map<string, Product>();
    existingProducts.forEach((p) => {
      if (p.sku) map.set(p.sku.trim().toLowerCase(), p);
    });
    return map;
  }, [existingProducts]);

  const handleReset = () => {
    setFileName('');
    setRows([]);
    setErrors([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    if (importing) return;
    handleReset();
    onClose();
  };

  const handleSelectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const text = await file.text();
      const result = parseImportedProducts(text, file.name);
      setRows(result.rows);
      setErrors(result.errors);
    } catch {
      setRows([]);
      setErrors(['Não foi possível ler o arquivo selecionado.']);
    }
  };

  const handleDownloadTemplate = () => {
    const csv = buildProductImportTemplateCsv();
    downloadFile(csv, 'modelo-importacao-produtos.csv', 'text/csv;charset=utf-8;');
    toast.success('Planilha modelo (.csv) baixada!');
  };

  const handleExportJsonBackup = () => {
    const json = exportProductsToJson(existingProducts);
    downloadFile(
      json,
      `catalogo-produtos-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json;charset=utf-8;'
    );
    toast.success('Backup completo do catálogo (.json) exportado!');
  };

  const stats = useMemo(() => {
    let toCreate = 0;
    let toUpdate = 0;
    let toSkip = 0;
    rows.forEach((r) => {
      const match = existingBySku.get(r.payload.sku.trim().toLowerCase());
      if (match) {
        if (updateExistingBySku) toUpdate += 1;
        else toSkip += 1;
      } else {
        toCreate += 1;
      }
    });
    return { toCreate, toUpdate, toSkip };
  }, [existingBySku, rows, updateExistingBySku]);

  const handleConfirmImport = async () => {
    if (!enterpriseId || rows.length === 0) return;
    setImporting(true);
    let created = 0;
    let updated = 0;
    let skipped = 0;

    try {
      for (let i = 0; i < rows.length; i += 1) {
        const { payload } = rows[i];
        const existing = existingBySku.get(payload.sku.trim().toLowerCase());
        if (existing) {
          if (updateExistingBySku) {
            // eslint-disable-next-line no-await-in-loop
            await updateProduct(enterpriseId, existing.id, payload);
            updated += 1;
          } else {
            skipped += 1;
          }
        } else {
          // eslint-disable-next-line no-await-in-loop
          await createProduct(enterpriseId, payload);
          created += 1;
        }
      }

      toast.success(
        `Importação concluída: ${created} criado(s), ${updated} atualizado(s)${
          skipped ? `, ${skipped} ignorado(s)` : ''
        }.`
      );
      await onImported();
      handleReset();
      onClose();
    } catch (error) {
      toast.error(getFirebaseErrorMessage(error, 'Erro ao importar produtos'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md">
      <DialogTitle>Importar & Exportar Catálogo de Produtos</DialogTitle>

      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Alert severity="info" sx={{ borderRadius: 1.5 }}>
            Importe arquivos <strong>.CSV</strong> ou <strong>.JSON</strong> no padrão do sistema ou
            planilhas exportadas de <strong>iFood, 99Food e Anota AI</strong> (colunas como{' '}
            <em>Nome, Categoria, Descrição, Preço, Preço Promocional, Temperatura, Combo, Foto</em>{' '}
            são mapeadas automaticamente).
          </Alert>

          {/* Ações de Modelo / Backup */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button
              variant="soft"
              color="primary"
              onClick={handleDownloadTemplate}
              startIcon={<Iconify icon="solar:download-minimalistic-bold" />}
            >
              Baixar Planilha Modelo (.csv)
            </Button>

            <Button
              variant="soft"
              color="info"
              disabled={existingProducts.length === 0}
              onClick={handleExportJsonBackup}
              startIcon={<Iconify icon="solar:code-file-bold-duotone" />}
            >
              Exportar Catálogo Completo (.json)
            </Button>
          </Stack>

          {/* Área de seleção de arquivo */}
          <Box
            onClick={() => fileInputRef.current?.click()}
            sx={{
              p: 3,
              borderRadius: 1.5,
              cursor: 'pointer',
              textAlign: 'center',
              border: (theme) => `1.5px dashed ${theme.vars.palette.primary.main}`,
              bgcolor: (theme) => varAlpha(theme.vars.palette.primary.mainChannel, 0.04),
              '&:hover': {
                bgcolor: (theme) => varAlpha(theme.vars.palette.primary.mainChannel, 0.08),
              },
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              style={{ display: 'none' }}
              onChange={handleSelectFile}
            />
            <Iconify
              icon="solar:cloud-upload-bold-duotone"
              width={40}
              sx={{ color: 'primary.main', mb: 1 }}
            />
            <Typography variant="subtitle2">
              {fileName || 'Clique para selecionar um arquivo .CSV ou .JSON'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Aceita separador ponto e vírgula (;) ou vírgula (,), valores em R$ e URLs de imagens.
            </Typography>
          </Box>

          {errors.length > 0 && (
            <Alert severity="warning" sx={{ borderRadius: 1.5 }}>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                Avisos encontrados ({errors.length}):
              </Typography>
              {errors.slice(0, 5).map((err, idx) => (
                <Typography key={idx} variant="caption" display="block">
                  • {err}
                </Typography>
              ))}
            </Alert>
          )}

          {rows.length > 0 && (
            <>
              <Divider sx={{ borderStyle: 'dashed' }} />

              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                justifyContent="space-between"
                spacing={1}
              >
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip size="small" color="success" label={`${stats.toCreate} novo(s)`} />
                  {stats.toUpdate > 0 && (
                    <Chip size="small" color="info" label={`${stats.toUpdate} atualizar por SKU`} />
                  )}
                  {stats.toSkip > 0 && (
                    <Chip size="small" color="default" label={`${stats.toSkip} ignorado(s)`} />
                  )}
                </Stack>

                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={updateExistingBySku}
                      onChange={(e) => setUpdateExistingBySku(e.target.checked)}
                    />
                  }
                  label="Atualizar produtos existentes pelo SKU"
                />
              </Stack>

              <TableContainer sx={{ maxHeight: 300 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Produto / SKU</TableCell>
                      <TableCell>Categoria</TableCell>
                      <TableCell>Preço</TableCell>
                      <TableCell>Atributos</TableCell>
                      <TableCell align="right">Ação</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.slice(0, 50).map((row) => {
                      const p = row.payload;
                      const pricing = getEffectiveProductPrice(p);
                      const isExisting = existingBySku.has(p.sku.trim().toLowerCase());
                      return (
                        <TableRow key={`${p.sku}-${row.rowIndex}`}>
                          <TableCell>
                            <Typography variant="subtitle2" noWrap sx={{ maxWidth: 220 }}>
                              {p.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              SKU: {p.sku}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption">{p.category || '—'}</Typography>
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            {pricing.hasDiscount ? (
                              <Stack direction="row" spacing={0.5} alignItems="baseline">
                                <Typography variant="caption" color="success.main" sx={{ fontWeight: 700 }}>
                                  {fCurrency(pricing.effectivePrice)}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  sx={{ textDecoration: 'line-through', color: 'text.disabled' }}
                                >
                                  {fCurrency(pricing.basePrice)}
                                </Typography>
                              </Stack>
                            ) : (
                              <Typography variant="caption">
                                {fCurrency(p.salePrice ?? 0)}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                              {p.servingTemperature === 'cold' && (
                                <Label variant="soft" color="info">
                                  Gelado
                                </Label>
                              )}
                              {p.servingTemperature === 'hot' && (
                                <Label variant="soft" color="error">
                                  Quente
                                </Label>
                              )}
                              {p.isCombo && (
                                <Label variant="soft" color="primary">
                                  Combo
                                </Label>
                              )}
                              {p.imageUrl && (
                                <Label variant="soft" color="default">
                                  Foto
                                </Label>
                              )}
                            </Stack>
                          </TableCell>
                          <TableCell align="right">
                            <Label
                              variant="soft"
                              color={
                                isExisting
                                  ? updateExistingBySku
                                    ? 'info'
                                    : 'default'
                                  : 'success'
                              }
                            >
                              {isExisting
                                ? updateExistingBySku
                                  ? 'Atualizar'
                                  : 'Ignorar'
                                : 'Novo'}
                            </Label>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button variant="outlined" color="inherit" onClick={handleClose} disabled={importing}>
          Cancelar
        </Button>
        <LoadingButton
          variant="contained"
          loading={importing}
          disabled={stats.toCreate + stats.toUpdate === 0}
          onClick={handleConfirmImport}
          startIcon={<Iconify icon="solar:import-bold-duotone" />}
        >
          Importar {stats.toCreate + stats.toUpdate} produto(s)
        </LoadingButton>
      </DialogActions>
    </Dialog>
  );
}
