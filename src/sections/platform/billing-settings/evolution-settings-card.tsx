import { useState, useEffect, useCallback } from 'react';

import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import Collapse from '@mui/material/Collapse';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import LoadingButton from '@mui/lab/LoadingButton';

import { useBoolean } from 'src/hooks/use-boolean';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import {
  getEvolutionPlatformStatusCf,
  updateEvolutionPlatformConfigCf,
} from 'src/api/firestore/whatsapp';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------

export function EvolutionSettingsCard() {
  const open = useBoolean(true);

  const [baseUrl, setBaseUrl] = useState('https://evo.ds3i.com.br');
  const [apiKey, setApiKey] = useState('');
  const [configured, setConfigured] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getEvolutionPlatformStatusCf();
      if (res.baseUrl) setBaseUrl(res.baseUrl);
      setConfigured(res.apiKeyConfigured);
    } catch {
      // silent if not configured yet
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await updateEvolutionPlatformConfigCf({
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
      });
      setConfigured(res.apiKeyConfigured);
      setApiKey('');
      toast.success('Configuração da Evolution API salva com segurança!');
    } catch (error) {
      toast.error(getFirebaseErrorMessage(error, 'Erro ao salvar configuração da Evolution API.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card sx={{ mt: 3 }}>
      <CardHeader
        title="Integração WhatsApp — Evolution API (Plano Ultra)"
        subheader="Credenciais globais armazenadas exclusivamente em platformSecrets/evolution"
        action={
          <Stack direction="row" spacing={1} alignItems="center">
            <Label variant="soft" color={configured ? 'success' : 'warning'}>
              {configured ? 'Token configurado' : 'Token pendente'}
            </Label>
            <IconButton onClick={open.onToggle}>
              <Iconify
                icon={open.value ? 'eva:arrow-ios-upward-fill' : 'eva:arrow-ios-downward-fill'}
              />
            </IconButton>
          </Stack>
        }
        sx={{ mb: 3 }}
      />
      <Collapse in={open.value}>
        <Divider />
        <Stack spacing={2.5} sx={{ p: 3 }}>
          <TextField
            fullWidth
            label="URL da Evolution API"
            placeholder="https://evo.ds3i.com.br"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <TextField
            fullWidth
            type="password"
            label="Global API Key (deixe em branco para manter a atual)"
            placeholder={configured ? '••••••••••••••••••••••••' : 'Cole a API Key da Evolution'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            helperText="Salva de forma criptografada no backend (nunca exposta ao navegador)."
          />
          <Stack direction="row" justifyContent="flex-end">
            <LoadingButton variant="contained" loading={saving} onClick={handleSave}>
              Salvar Evolution API
            </LoadingButton>
          </Stack>
        </Stack>
      </Collapse>
    </Card>
  );
}
