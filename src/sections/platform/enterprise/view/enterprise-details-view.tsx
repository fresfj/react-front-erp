import type { TenantRole } from 'src/auth/firebase-claims';
import type { Enterprise, EnterpriseMember } from 'src/api/firestore/platform';

import { z as zod } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Collapse from '@mui/material/Collapse';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import LoadingButton from '@mui/lab/LoadingButton';

import { paths } from 'src/routes/paths';
import { RouterLink } from 'src/routes/components';

import { useBoolean } from 'src/hooks/use-boolean';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { TENANT_ROLES } from 'src/auth/firebase-claims';
import {
  getEnterprise,
  inviteMember,
  setMemberClaims,
  listEnterpriseMembersClient,
} from 'src/api/firestore/platform';

import { Label } from 'src/components/label';
import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';
import { EmptyContent } from 'src/components/empty-content';
import { Form, Field } from 'src/components/hook-form';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';
import { TableHeadCustom } from 'src/components/table';

import { useAuthContext } from 'src/auth/hooks';

// ----------------------------------------------------------------------

const InviteSchema = zod.object({
  email: zod.string().email(),
  role: zod.enum(['admin', 'gestor', 'operador']),
  tempPassword: zod.string().optional().or(zod.literal('')),
});

type InviteSchemaType = zod.infer<typeof InviteSchema>;

type Props = {
  enterpriseId: string;
};

// ----------------------------------------------------------------------

export function EnterpriseDetailsView({ enterpriseId }: Props) {
  const { t } = useTranslate('common');
  const { user } = useAuthContext();
  const openInvite = useBoolean(true);

  const [loading, setLoading] = useState(true);
  const [enterprise, setEnterprise] = useState<Enterprise | null>(null);
  const [members, setMembers] = useState<EnterpriseMember[]>([]);

  const methods = useForm<InviteSchemaType>({
    resolver: zodResolver(InviteSchema),
    defaultValues: { email: '', role: 'operador', tempPassword: '' },
  });

  const {
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = methods;

  const load = useCallback(async () => {
    if (!user?.platformAdmin || !enterpriseId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [ent, mems] = await Promise.all([
        getEnterprise(enterpriseId),
        listEnterpriseMembersClient(enterpriseId),
      ]);
      setEnterprise(ent);
      setMembers(mems);
    } catch (error) {
      console.error(error);
      toast.error(t('enterprises.loadError'));
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, t, user?.platformAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const onInvite = handleSubmit(async (data) => {
    try {
      await inviteMember({
        email: data.email.trim(),
        enterpriseId,
        role: data.role,
        tempPassword: data.tempPassword?.trim() || undefined,
      });
      toast.success(t('enterprises.inviteSuccess'));
      reset({ email: '', role: 'operador', tempPassword: '' });
      await load();
    } catch (error) {
      console.error(error);
      toast.error(t('enterprises.inviteError'));
    }
  });

  const handleRoleChange = async (uid: string, role: TenantRole) => {
    try {
      await setMemberClaims({ uid, enterpriseId, role });
      toast.success(t('enterprises.roleSuccess'));
      await load();
    } catch (error) {
      console.error(error);
      toast.error(t('enterprises.roleError'));
    }
  };

  if (!user?.platformAdmin) {
    return (
      <DashboardContent>
        <EmptyContent title={t('permission.deniedTitle')} description={t('permission.deniedBody')} />
      </DashboardContent>
    );
  }

  return (
    <DashboardContent>
      <CustomBreadcrumbs
        heading={enterprise?.name || t('enterprises.detailsHeading')}
        links={[
          { name: t('app.dashboard'), href: paths.dashboard.root },
          { name: t('nav.enterprises'), href: paths.dashboard.enterprises.list },
          { name: enterprise?.name || enterpriseId },
        ]}
        action={
          <Button
            component={RouterLink}
            href={paths.dashboard.enterprises.edit(enterpriseId)}
            variant="contained"
            startIcon={<Iconify icon="solar:pen-bold" />}
          >
            {t('enterprises.editHeading')}
          </Button>
        }
        sx={{ mb: { xs: 3, md: 5 } }}
      />

      <Stack spacing={3}>
        <Card sx={{ p: 3 }}>
          {loading && !enterprise ? (
            <Typography>{t('common.comingSoon')}</Typography>
          ) : (
            <Stack spacing={1}>
              <Typography variant="h6">{enterprise?.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                ID: {enterprise?.id}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('enterprises.fields.adminEmail')}: {enterprise?.adminEmail || '—'}
              </Typography>
              <Label
                color={enterprise?.active ? 'success' : 'default'}
                variant="soft"
                sx={{ alignSelf: 'flex-start' }}
              >
                {enterprise?.active
                  ? t('enterprises.filters.activeOnly')
                  : t('enterprises.filters.inactiveOnly')}
              </Label>
            </Stack>
          )}
        </Card>

        <Card>
          <CardHeader
            title={t('enterprises.inviteTitle')}
            subheader={t('enterprises.inviteHint')}
            action={
              <IconButton onClick={openInvite.onToggle}>
                <Iconify
                  icon={
                    openInvite.value
                      ? 'eva:arrow-ios-upward-fill'
                      : 'eva:arrow-ios-downward-fill'
                  }
                />
              </IconButton>
            }
            sx={{ mb: openInvite.value ? 3 : 0 }}
          />
          <Collapse in={openInvite.value}>
            <Divider />
            <Form methods={methods} onSubmit={onInvite}>
              <Stack spacing={3} sx={{ p: 3 }}>
                <Box
                  columnGap={2}
                  rowGap={3}
                  display="grid"
                  gridTemplateColumns={{ xs: 'repeat(1, 1fr)', md: 'repeat(3, 1fr)' }}
                >
                  <Field.Text name="email" label={t('enterprises.fields.memberEmail')} />
                  <Field.Select name="role" label={t('enterprises.fields.role')}>
                    {TENANT_ROLES.map((role) => (
                      <MenuItem key={role} value={role}>
                        {t(`enterprises.roles.${role}`)}
                      </MenuItem>
                    ))}
                  </Field.Select>
                  <Field.Text
                    name="tempPassword"
                    label={t('enterprises.fields.tempPassword')}
                    type="password"
                    helperText={t('enterprises.tempPasswordHint')}
                  />
                </Box>
                <Stack direction="row" justifyContent="flex-end">
                  <LoadingButton type="submit" variant="contained" loading={isSubmitting}>
                    {t('enterprises.inviteSubmit')}
                  </LoadingButton>
                </Stack>
              </Stack>
            </Form>
          </Collapse>
        </Card>

        <Card>
          <CardHeader title={t('enterprises.membersHeading')} sx={{ mb: 2 }} />
          <Scrollbar>
            <Table size="small">
              <TableHeadCustom
                headLabel={[
                  { id: 'email', label: t('enterprises.fields.memberEmail') },
                  { id: 'role', label: t('enterprises.fields.role'), width: 180 },
                  { id: 'uid', label: 'UID', width: 220 },
                  { id: '', width: 160 },
                ]}
              />
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.uid}>
                    <TableCell>{member.email || member.displayName || '—'}</TableCell>
                    <TableCell>
                      {member.role ? t(`enterprises.roles.${member.role}`, { defaultValue: member.role }) : '—'}
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                        {member.uid}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <FieldRoleSelect
                        value={(member.role as TenantRole) || 'operador'}
                        onChange={(role) => handleRoleChange(member.uid, role)}
                        label={t('enterprises.setRole')}
                      />
                    </TableCell>
                  </TableRow>
                ))}

                {!members.length && (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <EmptyContent title={t('enterprises.membersEmpty')} sx={{ py: 4 }} />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Scrollbar>
        </Card>
      </Stack>
    </DashboardContent>
  );
}

// ----------------------------------------------------------------------

function FieldRoleSelect({
  value,
  onChange,
  label,
}: {
  value: TenantRole;
  onChange: (role: TenantRole) => void;
  label: string;
}) {
  const { t } = useTranslate('common');

  return (
    <TextField
      select
      size="small"
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as TenantRole)}
      sx={{ minWidth: 140 }}
    >
      {TENANT_ROLES.map((role) => (
        <MenuItem key={role} value={role}>
          {t(`enterprises.roles.${role}`)}
        </MenuItem>
      ))}
    </TextField>
  );
}
