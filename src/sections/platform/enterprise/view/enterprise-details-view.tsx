import type { GridColDef } from '@mui/x-data-grid';
import type { TenantRole } from 'src/auth/firebase-claims';
import type { Enterprise } from 'src/api/firestore/platform';
import type { ErpGridSelectFilter } from 'src/components/erp-data-grid';
import type { TeamMember, MemberPermissionKey } from 'src/api/firestore/members';

import { z as zod } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import Dialog from '@mui/material/Dialog';
import Switch from '@mui/material/Switch';
import Divider from '@mui/material/Divider';
import Collapse from '@mui/material/Collapse';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';
import DialogTitle from '@mui/material/DialogTitle';
import { GridActionsCellItem } from '@mui/x-data-grid';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import FormControlLabel from '@mui/material/FormControlLabel';

import { paths } from 'src/routes/paths';
import { RouterLink } from 'src/routes/components';

import { useBoolean } from 'src/hooks/use-boolean';

import { fDateTime } from 'src/utils/format-time';
import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import {
  inviteMember,
  getEnterprise,
  setMemberClaims,
} from 'src/api/firestore/platform';
import {
  listTeamMembers,
  ALL_MEMBER_PERMISSIONS,
  updateTeamMemberPermissions,
  DEFAULT_OPERATOR_PERMISSIONS,
} from 'src/api/firestore/members';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Form, Field } from 'src/components/hook-form';
import { ErpDataGrid } from 'src/components/erp-data-grid';
import { EmptyContent } from 'src/components/empty-content';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

const ROLE_OPTIONS = [
  { value: 'operador', label: 'Operador (PDV)' },
  { value: 'gestor', label: 'Gestor' },
  { value: 'admin', label: 'Administrador' },
];

const InviteMemberSchema = zod.object({
  displayName: zod.string().min(1, { message: 'Informe o nome do colaborador' }),
  email: zod.string().email({ message: 'E-mail inválido' }),
  role: zod.enum(['admin', 'gestor', 'operador']),
  tempPassword: zod.string().min(6, { message: 'Mínimo de 6 caracteres' }),
});

type InviteMemberSchemaType = zod.infer<typeof InviteMemberSchema>;

type Props = {
  enterpriseId: string;
};

// ----------------------------------------------------------------------

export function EnterpriseDetailsView({ enterpriseId }: Props) {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const openInviteCard = useBoolean(false);
  const permModal = useBoolean();

  const [loading, setLoading] = useState(true);
  const [enterprise, setEnterprise] = useState<Enterprise | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<MemberPermissionKey[]>(
    DEFAULT_OPERATOR_PERMISSIONS
  );

  // Modal de edição de permissões e papel
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [editRole, setEditRole] = useState<TenantRole>('operador');
  const [editPerms, setEditPerms] = useState<MemberPermissionKey[]>([]);
  const [savingPerms, setSavingPerms] = useState(false);

  const methods = useForm<InviteMemberSchemaType>({
    mode: 'onSubmit',
    resolver: zodResolver(InviteMemberSchema),
    defaultValues: {
      displayName: '',
      email: '',
      role: 'operador',
      tempPassword: '',
    },
  });

  const {
    watch,
    reset,
    handleSubmit,
    formState: { isSubmitting },
  } = methods;

  const watchedRole = watch('role');

  const load = useCallback(async () => {
    if (!enterpriseId) return;

    setLoading(true);
    try {
      const [ent, mems] = await Promise.all([
        getEnterprise(enterpriseId),
        listTeamMembers(enterpriseId),
      ]);
      setEnterprise(ent);
      setMembers(mems);
    } catch (error) {
      console.error(error);
      toast.error(t('enterprises.loadError'));
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const onInvite = handleSubmit(async (data) => {
    try {
      await inviteMember({
        enterpriseId,
        email: data.email.trim(),
        role: data.role,
        displayName: data.displayName.trim(),
        tempPassword: data.tempPassword?.trim() || undefined,
        permissions: data.role === 'operador' ? selectedPermissions : undefined,
      });

      toast.success(t('enterprises.inviteSuccess', { defaultValue: 'Colaborador convidado com sucesso!' }));
      reset({
        displayName: '',
        email: '',
        role: 'operador',
        tempPassword: '',
      });
      setSelectedPermissions(DEFAULT_OPERATOR_PERMISSIONS);
      openInviteCard.onFalse();
      await load();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, t('enterprises.inviteError', { defaultValue: 'Erro ao convidar colaborador' })));
    }
  });

  const handleOpenEdit = useCallback(
    (member: TeamMember) => {
      setEditMember(member);
      setEditRole(member.role);
      setEditPerms(member.permissions ?? DEFAULT_OPERATOR_PERMISSIONS);
      permModal.onTrue();
    },
    [permModal]
  );

  const handleSaveMemberEdit = useCallback(async () => {
    if (!editMember) return;
    setSavingPerms(true);
    try {
      if (editMember.role !== editRole) {
        await setMemberClaims({
          uid: editMember.uid,
          enterpriseId,
          role: editRole,
        });
      }

      await updateTeamMemberPermissions(enterpriseId, editMember.uid, {
        permissions: editRole === 'operador' ? editPerms : [],
      });

      toast.success('Permissões e perfil atualizados com sucesso!');
      permModal.onFalse();
      await load();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao atualizar colaborador'));
    } finally {
      setSavingPerms(false);
    }
  }, [editMember, editRole, editPerms, enterpriseId, permModal, load]);

  const toggleInvitePerm = (key: MemberPermissionKey) => {
    setSelectedPermissions((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleEditPerm = (key: MemberPermissionKey) => {
    setEditPerms((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const dataFiltered = useMemo(() => {
    let rows = members;
    if (roleFilter.length) {
      rows = rows.filter((r) => roleFilter.includes(r.role));
    }
    return rows;
  }, [members, roleFilter]);

  const selectFilters: ErpGridSelectFilter[] = [
    {
      id: 'role',
      label: 'Filtrar por Papel',
      options: ROLE_OPTIONS,
      value: roleFilter,
      onChange: setRoleFilter,
    },
  ];

  const columns = useMemo<GridColDef<TeamMember>[]>(
    () => [
      {
        field: 'displayName',
        headerName: 'Colaborador',
        flex: 1,
        minWidth: 220,
        renderCell: (params) => (
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ height: 1 }}>
            <Avatar
              alt={params.row.displayName || params.row.email}
              sx={{
                bgcolor:
                  params.row.role === 'admin'
                    ? 'primary.main'
                    : params.row.role === 'gestor'
                      ? 'info.main'
                      : 'warning.main',
                color: 'common.white',
                fontWeight: 600,
                width: 36,
                height: 36,
              }}
            >
              {(params.row.displayName || params.row.email)?.charAt(0)?.toUpperCase()}
            </Avatar>
            <Stack spacing={0.25}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {params.row.displayName || 'Sem nome'}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {params.row.email}
              </Typography>
            </Stack>
          </Stack>
        ),
      },
      {
        field: 'role',
        headerName: 'Papel no ERP',
        width: 160,
        renderCell: (params) => {
          const { role } = params.row;
          const color =
            role === 'admin' ? 'primary' : role === 'gestor' ? 'info' : 'warning';
          const label =
            role === 'admin'
              ? 'Administrador'
              : role === 'gestor'
                ? 'Gestor'
                : 'Operador (PDV)';
          return (
            <Label color={color} variant="soft">
              {label}
            </Label>
          );
        },
      },
      {
        field: 'permissions',
        headerName: 'Permissões Ativas',
        flex: 1.5,
        minWidth: 260,
        renderCell: (params) => {
          if (params.row.role === 'admin' || params.row.role === 'gestor') {
            return (
              <Chip
                size="small"
                variant="outlined"
                color="success"
                label="Acesso Total Liberado"
              />
            );
          }
          const perms = params.row.permissions || [];
          if (!perms.length) {
            return (
              <Chip
                size="small"
                variant="outlined"
                color="default"
                label="Nenhuma permissão"
              />
            );
          }
          return (
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
              {perms.slice(0, 3).map((p) => {
                const meta = ALL_MEMBER_PERMISSIONS.find((m) => m.key === p);
                return (
                  <Chip
                    key={p}
                    size="small"
                    variant="soft"
                    color="primary"
                    label={meta?.label.split(' ')[0] || p}
                  />
                );
              })}
              {perms.length > 3 && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={`+${perms.length - 3}`}
                />
              )}
            </Stack>
          );
        },
      },
      {
        field: 'invitedAt',
        headerName: 'Data de Ingresso',
        width: 170,
        renderCell: (params) =>
          params.row.invitedAt ? fDateTime(params.row.invitedAt) || '—' : '—',
      },
      {
        type: 'actions',
        field: 'actions',
        headerName: ' ',
        align: 'right',
        headerAlign: 'right',
        width: 80,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        getActions: (params) => [
          <GridActionsCellItem
            key="edit"
            showInMenu
            icon={<Iconify icon="solar:settings-bold" />}
            label="Permissões & Perfil"
            onClick={() => handleOpenEdit(params.row)}
          />,
        ],
      },
    ],
    [handleOpenEdit]
  );

  if (!user?.platformAdmin && user?.enterpriseId !== enterpriseId) {
    return (
      <DashboardContent>
        <EmptyContent title={t('permission.deniedTitle')} description={t('permission.deniedBody')} />
      </DashboardContent>
    );
  }

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={enterprise?.name || t('enterprises.detailsHeading', { defaultValue: 'Empresa' })}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: t('nav.enterprises'), href: paths.dashboard.enterprises.list },
          { name: enterprise?.name || enterpriseId },
        ]}
        action={
          <Stack direction="row" spacing={1.5}>
            <Button
              component={RouterLink}
              href={paths.dashboard.enterprises.edit(enterpriseId)}
              variant="outlined"
              startIcon={<Iconify icon="solar:pen-bold" />}
            >
              {t('enterprises.editHeading', { defaultValue: 'Editar Empresa' })}
            </Button>
            <Button
              variant="contained"
              startIcon={<Iconify icon={openInviteCard.value ? 'eva:arrow-up-fill' : 'mingcute:add-line'} />}
              onClick={openInviteCard.onToggle}
            >
              Convidar Membro
            </Button>
          </Stack>
        }
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      <Stack spacing={3}>
        {/* Card de Identificação da Empresa */}
        <Card sx={{ p: 3 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2.5}
            alignItems={{ sm: 'center' }}
            justifyContent="space-between"
          >
            <Stack direction="row" spacing={2} alignItems="center">
              <Avatar
                alt={enterprise?.name}
                sx={{
                  width: 56,
                  height: 56,
                  bgcolor: 'primary.lighter',
                  color: 'primary.darker',
                  fontWeight: 700,
                  fontSize: '1.5rem',
                }}
              >
                {enterprise?.name?.charAt(0)?.toUpperCase() || 'E'}
              </Avatar>
              <Stack spacing={0.5}>
                <Typography variant="h6">{enterprise?.name || enterpriseId}</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  ID: {enterpriseId} &bull; Admin: {enterprise?.adminEmail || '—'}
                </Typography>
              </Stack>
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center">
              <Label color={enterprise?.active ? 'success' : 'default'} variant="soft">
                {enterprise?.active
                  ? t('enterprises.filters.activeOnly', { defaultValue: 'Ativa' })
                  : t('enterprises.filters.inactiveOnly', { defaultValue: 'Inativa' })}
              </Label>
              <Chip
                variant="outlined"
                icon={<Iconify icon="solar:users-group-rounded-bold" />}
                label={`${members.length} colaboradores`}
              />
            </Stack>
          </Stack>
        </Card>

        <Card sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 1.5 }}>
            {t('billing.title')}
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              label={`${t('billing.currentPlan')}: ${enterprise?.subscription?.planCode || '—'}`}
            />
            <Chip
              size="small"
              color="info"
              label={`${t('billing.status')}: ${enterprise?.subscription?.status || '—'}`}
            />
            {enterprise?.subscription?.currentPeriodEnd && (
              <Chip
                size="small"
                variant="outlined"
                label={`${t('billing.periodEnd')}: ${enterprise.subscription.currentPeriodEnd}`}
              />
            )}
            {enterprise?.subscription?.cancelAtPeriodEnd && (
              <Chip size="small" color="warning" label={t('billing.cancelAtPeriodEnd')} />
            )}
            {enterprise?.subscription?.pastDueSince && (
              <Chip
                size="small"
                color="error"
                label={`pastDueSince: ${enterprise.subscription.pastDueSince}`}
              />
            )}
          </Stack>
        </Card>

        {/* Card Formulário de Convite de Membro (Colapsável) */}
        <Card>
          <CardHeader
            title="Convidar Novo Colaborador para a Empresa"
            subheader="Defina nome, e-mail, papel de acesso e permissões operacionais granulares"
            action={
              <IconButton onClick={openInviteCard.onToggle}>
                <Iconify
                  icon={openInviteCard.value ? 'eva:arrow-ios-upward-fill' : 'eva:arrow-ios-downward-fill'}
                />
              </IconButton>
            }
            sx={{ p: 3 }}
          />
          <Collapse in={openInviteCard.value}>
            <Divider />
            <Form methods={methods} onSubmit={onInvite}>
              {/* Prevenção de autofill indesejado de gerenciadores de senhas */}
              <input type="text" style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" />
              <input type="password" style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" />

              <Stack spacing={3} sx={{ p: 3 }}>
                <Box
                  sx={{
                    rowGap: 3,
                    columnGap: 2,
                    display: 'grid',
                    gridTemplateColumns: { xs: 'repeat(1, 1fr)', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
                  }}
                >
                  <Field.Text
                    name="displayName"
                    label="Nome do colaborador"
                    autoComplete="off"
                    inputProps={{ autoComplete: 'off' }}
                    required
                  />
                  <Field.Text
                    name="email"
                    label="E-mail de acesso"
                    autoComplete="off"
                    inputProps={{
                      autoComplete: 'new-password',
                      form: { autoComplete: 'off' },
                    }}
                    required
                  />
                  <Field.Select name="role" label="Papel no ERP">
                    {ROLE_OPTIONS.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </Field.Select>
                  <Field.Text
                    name="tempPassword"
                    label="Senha temporária"
                    type="password"
                    placeholder="Mín. 6 dígitos"
                    helperText="O usuário poderá alterar após entrar"
                    autoComplete="new-password"
                    inputProps={{
                      autoComplete: 'new-password',
                      form: { autoComplete: 'off' },
                    }}
                    required
                  />
                </Box>

                {watchedRole === 'operador' && (
                  <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: 'background.neutral' }}>
                    <Typography variant="subtitle2" sx={{ mb: 1.5, color: 'text.primary' }}>
                      Permissões Granulares (Operador PDV)
                    </Typography>
                    <Box
                      sx={{
                        rowGap: 1.5,
                        columnGap: 2,
                        display: 'grid',
                        gridTemplateColumns: { xs: 'repeat(1, 1fr)', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
                      }}
                    >
                      {ALL_MEMBER_PERMISSIONS.map((perm) => (
                        <FormControlLabel
                          key={perm.key}
                          control={
                            <Checkbox
                              checked={selectedPermissions.includes(perm.key)}
                              onChange={() => toggleInvitePerm(perm.key)}
                              size="small"
                            />
                          }
                          label={
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {perm.label}
                            </Typography>
                          }
                        />
                      ))}
                    </Box>
                  </Box>
                )}

                <Stack direction="row" justifyContent="flex-end" spacing={1.5}>
                  <Button variant="outlined" color="inherit" onClick={openInviteCard.onFalse}>
                    Cancelar
                  </Button>
                  <LoadingButton type="submit" variant="contained" loading={isSubmitting}>
                    Enviar Convite / Cadastrar
                  </LoadingButton>
                </Stack>
              </Stack>
            </Form>
          </Collapse>
        </Card>

        {/* Tabela de Membros da Empresa com ErpDataGrid */}
        <Card sx={{ height: 680, display: 'flex', flexDirection: 'column' }}>
          <ErpDataGrid<TeamMember>
            rows={dataFiltered}
            columns={columns}
            loading={loading}
            getRowId={(row) => row.uid}
            getRowHeight={() => 'auto'}
            toolbar={{
              selectFilters,
              searchPlaceholder: 'Buscar por nome, e-mail ou perfil...',
            }}
          />
        </Card>
      </Stack>

      {/* Modal de Edição de Permissões e Papel */}
      <Dialog open={permModal.value} onClose={permModal.onFalse} maxWidth="sm" fullWidth>
        <DialogTitle>Gerenciar Colaborador</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <Box>
              <Typography variant="subtitle2">{editMember?.displayName || 'Colaborador'}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {editMember?.email}
              </Typography>
            </Box>

            <TextField
              select
              fullWidth
              label="Papel no ERP"
              value={editRole}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEditRole(e.target.value as TenantRole)
              }
            >
              {ROLE_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>

            {editRole === 'operador' ? (
              <Stack spacing={1}>
                <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
                  Permissões Granulares:
                </Typography>
                {ALL_MEMBER_PERMISSIONS.map((perm) => (
                  <FormControlLabel
                    key={perm.key}
                    control={
                      <Switch
                        checked={editPerms.includes(perm.key)}
                        onChange={() => toggleEditPerm(perm.key)}
                        size="small"
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {perm.label}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {perm.description}
                        </Typography>
                      </Box>
                    }
                  />
                ))}
              </Stack>
            ) : (
              <Box sx={{ p: 2, borderRadius: 1, bgcolor: 'background.neutral' }}>
                <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 600 }}>
                  Perfis Gestor e Administrador possuem permissão total irrestrita no sistema.
                </Typography>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="inherit" onClick={permModal.onFalse}>
            Cancelar
          </Button>
          <LoadingButton
            variant="contained"
            loading={savingPerms}
            onClick={handleSaveMemberEdit}
          >
            Salvar Alterações
          </LoadingButton>
        </DialogActions>
      </Dialog>
    </DashboardContent>
  );
}
