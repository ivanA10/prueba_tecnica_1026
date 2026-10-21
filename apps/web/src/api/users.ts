import { api } from './api';
import type { Page, Role, User } from './types';

export const usersApi = api.injectEndpoints({
  endpoints: (b) => ({
    getUsers: b.query<Page<User>, { page: number; limit: number }>({
      query: ({ page, limit }) => `/users?page=${page}&limit=${limit}`,
      providesTags: ['User'],
    }),
    createUser: b.mutation<User, { name: string; email: string; password: string; roleId: string }>({
      query: (body) => ({ url: '/users', method: 'POST', body }),
      invalidatesTags: ['User'],
    }),
    updateUser: b.mutation<User, { id: string; name?: string; email?: string }>({
      query: ({ id, ...body }) => ({ url: `/users/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['User'],
    }),
    deleteUser: b.mutation<void, string>({
      query: (id) => ({ url: `/users/${id}`, method: 'DELETE' }),
      invalidatesTags: ['User'],
    }),
    assignRole: b.mutation<User, { id: string; roleId: string }>({
      query: ({ id, roleId }) => ({ url: `/users/${id}/role`, method: 'PUT', body: { roleId } }),
      invalidatesTags: ['User'],
    }),
    getRoleOptions: b.query<Role[], void>({ query: () => '/roles' }),
  }),
});

export const {
  useGetUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
  useAssignRoleMutation,
  useGetRoleOptionsQuery,
} = usersApi;
