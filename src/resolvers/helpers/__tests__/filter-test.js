/* @flow */

import { InputTypeComposer, schemaComposer, type TypeComposer } from 'graphql-compose';
import { GraphQLInputObjectType, GraphQLNonNull, GraphQLList } from 'graphql-compose/lib/graphql';
import { filterHelperArgs, filterHelper } from '../filter';
import { OPERATORS_FIELDNAME } from '../filterOperators';
import GraphQLMongoID from '../../../types/mongoid';
import { UserModel } from '../../../__mocks__/userModel';
import { convertModelToGraphQL } from '../../../fieldsConverter';

describe('Resolver helper `filter` ->', () => {
  let UserTC: TypeComposer;

  beforeEach(() => {
    schemaComposer.clear();
    UserTC = convertModelToGraphQL(UserModel, 'User', schemaComposer);
  });

  describe('filterHelperArgs()', () => {
    it('should throw error if first arg is not TypeComposer', () => {
      expect(() => {
        const wrongArgs: any = [{}];
        filterHelperArgs(...wrongArgs);
      }).toThrowError('should be instance of TypeComposer');
    });

    it('should throw error if second arg is not MongooseModel', () => {
      expect(() => {
        const wrongArgs: any = [UserTC, {}];
        filterHelperArgs(...wrongArgs);
      }).toThrowError('should be instance of MongooseModel');
    });

    it('should throw error if `filterTypeName` not provided in opts', () => {
      expect(() => filterHelperArgs(UserTC, UserModel)).toThrowError(
        'provide non-empty `filterTypeName`'
      );
    });

    it('should return filter field', () => {
      const args: any = filterHelperArgs(UserTC, UserModel, {
        filterTypeName: 'FilterUserType',
      });
      expect(args.filter.type).toBeInstanceOf(GraphQLInputObjectType);
    });

    it('should return filter with field _ids', () => {
      const args: any = filterHelperArgs(UserTC, UserModel, {
        filterTypeName: 'FilterUserType',
      });
      const itc = new InputTypeComposer(args.filter.type);
      const ft: any = itc.getFieldType('_ids');
      expect(ft).toBeInstanceOf(GraphQLList);
      expect(ft.ofType).toBe(GraphQLMongoID);
    });

    it('should for opts.isRequired=true return GraphQLNonNull', () => {
      const args: any = filterHelperArgs(UserTC, UserModel, {
        filterTypeName: 'FilterUserType',
        isRequired: true,
      });
      expect(args.filter.type).toBeInstanceOf(GraphQLNonNull);
    });

    it('should remove fields via opts.removeFields', () => {
      const args: any = filterHelperArgs(UserTC, UserModel, {
        filterTypeName: 'FilterUserType',
        removeFields: ['name', 'age'],
      });
      const itc = new InputTypeComposer(args.filter.type);
      expect(itc.hasField('name')).toBe(false);
      expect(itc.hasField('age')).toBe(false);
      expect(itc.hasField('gender')).toBe(true);
    });

    it('should set required fields via opts.requiredFields', () => {
      const args: any = filterHelperArgs(UserTC, UserModel, {
        filterTypeName: 'FilterUserType',
        requiredFields: ['name', 'age'],
      });
      const itc = new InputTypeComposer(args.filter.type);
      expect(itc.getFieldType('name')).toBeInstanceOf(GraphQLNonNull);
      expect(itc.getFieldType('age')).toBeInstanceOf(GraphQLNonNull);
      expect(itc.getFieldType('gender')).not.toBeInstanceOf(GraphQLNonNull);
    });

    it('should leave only indexed fields if opts.onlyIndexed=true', () => {
      const args: any = filterHelperArgs(UserTC, UserModel, {
        filterTypeName: 'FilterUserType',
        onlyIndexed: true,
        model: UserModel,
      });
      const itc = new InputTypeComposer(args.filter.type);
      expect(itc.hasField('_id')).toBe(true);
      expect(itc.hasField('name')).toBe(true);
      expect(itc.hasField('age')).toBe(false);
      expect(itc.hasField('gender')).toBe(false);
    });

    it('should opts.onlyIndexed=true and opts.removeFields works together', () => {
      const args: any = filterHelperArgs(UserTC, UserModel, {
        filterTypeName: 'FilterUserType',
        onlyIndexed: true,
        model: UserModel,
        removeFields: ['name'],
      });
      const itc = new InputTypeComposer(args.filter.type);
      expect(itc.hasField('_id')).toBe(true);
      expect(itc.hasField('name')).toBe(false);
      expect(itc.hasField('age')).toBe(false);
      expect(itc.hasField('gender')).toBe(false);
    });
  });

  describe('filterHelper()', () => {
    let spyWhereFn;
    let spyFindFn;
    let resolveParams: any;

    beforeEach(() => {
      spyWhereFn = jest.fn(() => {
        return resolveParams.query;
      });

      spyFindFn = jest.fn();
      resolveParams = {
        query: {
          ...UserModel.find(),
          where: spyWhereFn,
          find: spyFindFn,
        },
      };
    });

    it('should not call query.where if args.filter is empty', () => {
      filterHelper(resolveParams);
      expect(spyWhereFn).not.toBeCalled();
    });

    it('should call query.where if args.filter is provided', () => {
      resolveParams.args = {
        filter: { name: 'nodkz' },
      };
      filterHelper(resolveParams);
      expect(spyWhereFn).toBeCalledWith({ name: 'nodkz' });
    });

    it('should call query.where if args.filter provided with _ids', () => {
      resolveParams.args = {
        filter: {
          age: 30,
          _ids: [1, 2, 3],
        },
      };
      filterHelper(resolveParams);
      expect(spyWhereFn.mock.calls).toEqual([[{ _id: { $in: [1, 2, 3] } }], [{ age: 30 }]]);
    });

    it('should convert deep object in args.filter to dotted object', () => {
      resolveParams.args = {
        filter: {
          name: {
            first: 'Pavel',
          },
          age: 30,
        },
      };
      filterHelper(resolveParams);
      expect(spyWhereFn).toBeCalledWith({
        'name.first': 'Pavel',
        age: 30,
      });
    });

    it('should call query.find if args.filter.OPERATORS_FIELDNAME is provided', () => {
      resolveParams.args = {
        filter: {
          [OPERATORS_FIELDNAME]: { age: { gt: 10, lt: 20 } },
        },
      };
      filterHelper(resolveParams);
      expect(spyWhereFn).toBeCalledWith({ age: { $gt: 10, $lt: 20 } });
    });

    it('should add rawQuery to query', () => {
      resolveParams.args = {
        filter: {
          [OPERATORS_FIELDNAME]: { age: { gt: 10, lt: 20 } },
        },
      };
      resolveParams.rawQuery = {
        age: { max: 30 },
        active: true,
      };

      filterHelper(resolveParams);
      expect(spyWhereFn.mock.calls).toEqual([
        [{ age: { $gt: 10, $lt: 20 } }],
        [{ active: true, age: { max: 30 } }],
      ]);
    });
  });
});
