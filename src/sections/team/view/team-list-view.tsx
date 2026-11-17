import type { GridColDef } from '@mui/x-data-grid';
import type { TenantRole } from 'src/auth/firebase-claims';
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
import Dialog from '@mui/material/Dialog';
import Switch from '@mui/material/Switch';
import Divider from '@mui/material/Divider';
import Collapse from '@mui/material/Collapse';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
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

import { useBoolean } from 'src/hooks/use-boolean';

import { getFirebaseErrorMessage } from 'src/utils/firebase-error';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { inviteMember, setMemberClaims } from 'src/api/firestore/platform';
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
import { TENANT_ROLES } from 'src/auth/firebase-claims';

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

// ----------------------------------------------------------------------

export function TeamListView() {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();

  const openInviteCard = useBoolean(true);
  const permModal = useBoolean();

  const enterpriseId = user?.enterpriseId as string | undefined;
  const isAdmin =
    user?.role === 'admin' || user?.role === 'gestor' || Boolean(user?.platformAdmin);

  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<MemberPermissionKey[]>(
    DEFAULT_OPERATOR_PERMISSIONS
  );

  // Modal state for editing an existing member's permissions & role
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

  useEffect(() => {
    if (watchedRole === 'operador') {
      setSelectedPermissions(DEFAULT_OPERATOR_PERMISSIONS);
    } else {
      setSelectedPermissions(ALL_MEMBER_PERMISSIONS.map((p) => p.key));
    }
  }, [watchedRole]);

  const loadMembers = useCallback(async () => {
    if (!enterpriseId) {
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await listTeamMembers(enterpriseId);
      setMembers(rows);
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao carregar colaboradores'));
    } finally {
      setLoading(false);
    }
  }, [enterpriseId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const toggleCreatePermission = (key: MemberPermissionKey) => {
    setSelectedPermissions((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleEditPermission = (key: MemberPermissionKey) => {
    setEditPerms((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const onInviteSubmit = handleSubmit(async (data) => {
    if (!enterpriseId) return;

    try {
      await inviteMember({
        enterpriseId,
        email: data.email.trim().toLowerCase(),
        displayName: data.displayName.trim(),
        role: data.role,
        tempPassword: data.tempPassword.trim(),
        permissions: selectedPermissions,
      });

      toast.success('Colaborador criado e permissões configuradas com sucesso!');
      reset({
        displayName: '',
        email: '',
        role: 'operador',
        tempPassword: '',
      });
      setSelectedPermissions(DEFAULT_OPERATOR_PERMISSIONS);
      await loadMembers();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Não foi possível criar o acesso do colaborador'));
    }
  });

  const handleOpenEditPermissions = useCallback(
    (member: TeamMember) => {
      setEditMember(member);
      setEditRole(member.role);
      setEditPerms(member.permissions);
      permModal.onTrue();
    },
    [permModal]
  );

  const handleSaveMemberPermissions = async () => {
    if (!enterpriseId || !editMember) return;
    setSavingPerms(true);
    try {
      await updateTeamMemberPermissions(enterpriseId, editMember.uid, {
        role: editRole,
        permissions: editPerms,
      });

      try {
        await setMemberClaims({
          uid: editMember.uid,
          enterpriseId,
          role: editRole,
          permissions: editPerms,
        });
      } catch (fnErr) {
        console.warn('Cloud function setMemberClaims fallback to Firestore doc:', fnErr);
      }

      toast.success('Permissões do colaborador atualizadas!');
      permModal.onFalse();
      await loadMembers();
    } catch (error) {
      console.error(error);
      toast.error(getFirebaseErrorMessage(error, 'Erro ao atualizar permissões'));
    } finally {
      setSavingPerms(false);
    }
  };

  const dataFiltered = useMemo(() => {
    if (!roleFilter.length) return members;
    return members.filter((m) => roleFilter.includes(m.role));
  }, [members, roleFilter]);

  const selectFilters: ErpGridSelectFilter[] = [
    {
      id: 'role',
      label: 'Cargo / Perfil',
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
        width: 200,
        hideable: false,
        valueGetter: (_v, row) => row.displayName || row.email.split('@')[0],
      },
      {
        field: 'email',
        headerName: 'E-mail de Acesso',
        width: 230,
      },
      {
        field: 'role',
        headerName: 'Perfil / Cargo',
        width: 150,
        renderCell: (params) => (
          <Label
            color={
              params.row.role === 'admin'
                ? 'primary'
                : params.row.role === 'gestor'
                  ? 'info'
                  : 'warning'
            }
            variant="soft"
          >
            {params.row.role === 'operador'
              ? 'Operador (PDV)'
              : params.row.role === 'gestor'
                ? 'Gestor'
                : 'Admin'}
          </Label>
        ),
      },
      {
        field: 'permissions',
        headerName: 'Módulos Liberados (Sem DRE por padrão no Operador)',
        flex: 1,
        minWidth: 320,
        renderCell: (params) => (
          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ py: 1 }}>
            {params.row.permissions.map((permKey) => {
              const meta = ALL_MEMBER_PERMISSIONS.find((p) => p.key === permKey);
              return (
                <Chip
                  key={permKey}
                  size="small"
                  variant="soft"
                  color={meta?.defaultForOperator ? 'default' : 'info'}
                  label={meta?.label || permKey}
                />
              );
            })}
          </Stack>
        ),
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
        getActions: (params) =>
          isAdmin
            ? [
                <GridActionsCellItem
                  key="perms"
                  showInMenu
                  icon={<Iconify icon="solar:settings-bold" />}
                  label="Configurar Permissões"
                  onClick={() => handleOpenEditPermissions(params.row)}
                />,
              ]
            : [],
      },
    ],
    [handleOpenEditPermissions, isAdmin]
  );

  return (
    <>
      <DashboardContent>
        <CustomBreadcrumbs
          heading="Colaboradores e Permissões de Acesso (PDV / Caixa)"
          links={[
            { name: t('app.dashboard'), href: paths.dashboard.root },
            { name: 'Colaboradores' },
          ]}
          sx={{ mb: { xs: 3, md: 5 } }}
        />

        {!enterpriseId && (
          <EmptyContent filled title="Empresa não configurada na sessão" sx={{ py: 10 }} />
        )}

        {enterpriseId && (
          <Stack spacing={4}>
            {isAdmin && (
              <Card>
                <CardHeader
                  title="Cadastrar Acesso para Colaborador (Operador de PDV / Gestor)"
                  subheader="Por padrão, o Operador acessa apenas Emitir Venda (PDV), Clientes e Fechar Caixa (sem relatórios financeiros DRE). Marque abaixo caso queira liberar mais funcionalidades."
                  action={
                    <IconButton onClick={openInviteCard.onToggle}>
                      <Iconify
                        icon={
                          openInviteCard.value
                            ? 'eva:arrow-ios-downward-fill'
                            : 'eva:arrow-ios-forward-fill'
                        }
                      />
                    </IconButton>
                  }
                  sx={{ mb: 3 }}
                />

                <Collapse in={openInviteCard.value}>
                  <Divider />
                  <Form methods={methods} onSubmit={onInviteSubmit}>
                    <Stack spacing={3} sx={{ p: 3 }}>
                      <Box
                        columnGap={2}
                        rowGap={3}
                        display="grid"
                        gridTemplateColumns={{ xs: 'repeat(1, 1fr)', md: 'repeat(4, 1fr)' }}
                      >
                        <Field.Text
                          name="displayName"
                          label="Nome do colaborador"
                          autoComplete="name"
                        />
                        <Field.Text name="email" label="E-mail de login" autoComplete="off" />
                        <Field.Select name="role" label="Cargo / Perfil">
                          <MenuItem value="operador">Vendedor / Operador de PDV</MenuItem>
                          <MenuItem value="gestor">Gestor / Gerente</MenuItem>
                          <MenuItem value="admin">Administrador</MenuItem>
                        </Field.Select>
                        <Field.Text
                          name="tempPassword"
                          label="Senha inicial de acesso"
                          type="password"
                          placeholder="Mínimo 6 caracteres"
                          autoComplete="new-password"
                          inputProps={{ autoComplete: 'new-password' }}
                        />
                      </Box>

                      <Box>
                        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                          Funcionalidades liberadas para este colaborador:
                        </Typography>
                        <Box
                          columnGap={2}
                          rowGap={1}
                          display="grid"
                          gridTemplateColumns={{
                            xs: 'repeat(1, 1fr)',
                            sm: 'repeat(2, 1fr)',
                            md: 'repeat(3, 1fr)',
                          }}
                        >
                          {ALL_MEMBER_PERMISSIONS.map((perm) => {
                            const checked = selectedPermissions.includes(perm.key);
                            return (
                              <FormControlLabel
                                key={perm.key}
                                control={
                                  <Checkbox
                                    checked={checked}
                                    onChange={() => toggleCreatePermission(perm.key)}
                                  />
                                }
                                label={
                                  <Box>
                                    <Typography variant="body2" fontWeight={600}>
                                      {perm.label}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {perm.description}
                                    </Typography>
                                  </Box>
                                }
                              />
                            );
                          })}
                        </Box>
                      </Box>

                      <Stack direction="row" justifyContent="flex-end">
                        <LoadingButton
                          type="submit"
                          variant="contained"
                          size="large"
                          loading={isSubmitting}
                          sx={{ ml: 'auto' }}
                        >
                          Criar acesso do colaborador
                        </LoadingButton>
                      </Stack>
                    </Stack>
                  </Form>
                </Collapse>
              </Card>
            )}

            <Card sx={{ height: 600 }}>
              <ErpDataGrid<TeamMember>
                rows={dataFiltered}
                columns={columns}
                loading={loading}
                getRowId={(row) => row.uid}
                getRowHeight={() => 'auto'}
                emptyTitle="Nenhum colaborador cadastrado ainda"
                toolbar={{
                  selectFilters,
                  searchPlaceholder: 'Pesquisar colaborador por nome, e-mail…',
                  filteredResults: dataFiltered.length,
                }}
              />
            </Card>
          </Stack>
        )}
      </DashboardContent>

      {/* Modal: Configurar Permissões do Colaborador */}
      <Dialog open={permModal.value} onClose={permModal.onFalse} fullWidth maxWidth="sm">
        <DialogTitle>
          Permissões de {editMember?.displayName || editMember?.email}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Cargo / Perfil Base
              </Typography>
              <Stack direction="row" spacing={1}>
                {TENANT_ROLES.map((r) => (
                  <Button
                    key={r}
                    variant={editRole === r ? 'contained' : 'outlined'}
                    color={editRole === r ? 'primary' : 'inherit'}
                    size="small"
                    onClick={() => {
                      setEditRole(r);
                      if (r === 'operador') {
                        setEditPerms(DEFAULT_OPERATOR_PERMISSIONS);
                      } else {
                        setEditPerms(ALL_MEMBER_PERMISSIONS.map((p) => p.key));
                      }
                    }}
                  >
                    {r === 'operador' ? 'Operador (PDV)' : r === 'gestor' ? 'Gestor' : 'Admin'}
                  </Button>
                ))}
              </Stack>
            </Box>

            <Divider sx={{ borderStyle: 'dashed' }} />

            <Stack spacing={1.5}>
              <Typography variant="subtitle2">
                Liberar / Bloquear Funcionalidades no Menu e Sistema:
              </Typography>
              {ALL_MEMBER_PERMISSIONS.map((perm) => {
                const checked = editPerms.includes(perm.key);
                return (
                  <FormControlLabel
                    key={perm.key}
                    control={
                      <Switch
                        checked={checked}
                        onChange={() => toggleEditPermission(perm.key)}
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="subtitle2">{perm.label}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {perm.description}
                        </Typography>
                      </Box>
                    }
                  />
                );
              })}
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" variant="outlined" onClick={permModal.onFalse}>
            Cancelar
          </Button>
          <LoadingButton
            variant="contained"
            loading={savingPerms}
            onClick={handleSaveMemberPermissions}
          >
            Salvar permissões
          </LoadingButton>
        </DialogActions>
      </Dialog>
    </>
  );
}
