// Copyright (c) 2021 Terminus, Inc.
//
// This program is free software: you can use, redistribute, and/or modify
// it under the terms of the GNU Affero General Public License, version 3
// or later ("AGPL"), as published by the Free Software Foundation.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <http://www.gnu.org/licenses/>.

import React from 'react';
import cn from 'classnames';
import { Button, Drawer, Input, InputNumber, message, Modal, Select, Tag, Tooltip } from 'antd';
import { Form, ArrayFieldType, Table, Schema } from '@erda-ui/components';
import { filter, forEach, isNumber, map, pick } from 'lodash';
import { IFormFeedback } from '@formily/core';
import { createScaledRules, getScaledRules, updateScaledRules, applyCancelRules } from '../../../services/runtime';
import routeInfoStore from 'core/stores/route';
import { useUnmount } from 'react-use';
import i18n from 'i18n';

import './elastic-scaling.scss';
import { ErdaIcon } from 'common';

const {
  createForm,
  createFields,
  useFieldSchema,
  useField,
  observer,
  RecursionField,
  onFieldReact,
  isField,
  onFieldValueChange,
  toJS,
} = Form;

interface IProps {
  visible: boolean;
  serviceName: string;
  onClose: () => void;
}

const typeOptions = [
  { value: 'cpu', label: 'CPU' },
  { value: 'memory', label: i18n.s('memory') },
  { value: 'cron', label: 'Cron' },
];

const StatusTitle = ({
  started,
  runtimeId,
  ruleId,
  toggleStatus,
}: {
  started: boolean;
  runtimeId: number;
  ruleId: string | null;
  toggleStatus: () => void;
}) => {
  const takeAction = async (isCancel: boolean) => {
    await applyCancelRules({
      runtimeId,
      actions: [{ ruleId: ruleId!, action: isCancel ? 'cancel' : 'apply' }],
      $options: { successMsg: i18n.s('operate successfully') },
    });
    toggleStatus();
  };

  return (
    <div className="flex justify-between items-center">
      <div className="flex">
        <div>{i18n.s('Automatic elastic scaling', 'dop')}</div>
        <div className="ml-4">
          {!ruleId ? null : (
            <Tag className={cn('border-0 text-white', { 'bg-green-deep': started, 'bg-red-deep': !started })}>
              {started ? i18n.s('activated') : i18n.s('stopped')}
            </Tag>
          )}
        </div>
      </div>
      <div className="mr-8">
        {!ruleId ? null : started ? (
          <Button type="primary" onClick={() => takeAction(true)}>
            {i18n.s('stop')}
          </Button>
        ) : (
          <Button type="primary" onClick={() => takeAction(false)}>
            {i18n.s('activate')}
          </Button>
        )}
      </div>
    </div>
  );
};

const TriggersConfig = observer(
  (props: {
    value: ({ type: string; metadata: RUNTIME.Metadata } | { type: string; metadata: RUNTIME.CronMetadata })[];
  }) => {
    const schema = useFieldSchema();
    const field = useField<ArrayFieldType>();

    const [visible, setVisible] = React.useState(false);
    const [tableDataSource, setTableDataSource] = React.useState<{ type: string; value: string }[]>([]);
    const [previousValue, setPreviousValue] = React.useState<null | RUNTIME.Trigger[]>(null);
    const [isEditing, setIsEditing] = React.useState(false);
    const [currentIndex, setCurrentIndex] = React.useState(-1);

    const setDataSource = () => {
      const data = map(props.value, (item, index) => {
        if (!item.type) {
          return null;
        }
        if (item.type === 'cron') {
          return { type: 'Cron', value: '', index };
        }
        return {
          index,
          type: item.type === 'cpu' ? 'CPU' : i18n.s('memory'),
          value: (item.metadata as RUNTIME.Metadata).value,
        };
      }).filter((item): item is { type: string; value: string; index: number } => !!item);
      setTableDataSource(data);
    };

    useUnmount(() => {
      setTableDataSource([]);
    });

    React.useEffect(() => {
      if (!visible) {
        setDataSource();
      }
    }, [visible, props.value]);

    const currentTypes = React.useMemo(() => {
      return props.value.reduce<string[]>((acc, item) => {
        item.type && acc.push(item.type);
        return acc;
      }, []);
    }, [visible, props.value]);

    React.useEffect(() => {
      if (visible) {
        const currentTypeField = field.query(`triggers[${currentIndex}].type`).take();
        currentTypeField.setComponentProps({
          options: filter(
            typeOptions,
            ({ value }) =>
              !currentTypes.includes(value) || (isField(currentTypeField) && currentTypeField.value === value),
          ),
        });
      }
    }, [visible, currentTypes, currentIndex]);

    const columns = [
      {
        dataIndex: 'type',
        title: i18n.s('type'),
      },
      {
        dataIndex: 'value',
        title: (
          <span className="flex items-center">
            {i18n.s('target value', 'dop')}
            <Tooltip title={i18n.s('Target values are CPU usage, memory usage', 'dop')}>
              <ErdaIcon type="info" className="ml-1" />
            </Tooltip>
          </span>
        ),
        render: (text: string) => (`${text}` ? `${text ?? '-'}%` : ''),
      },
    ];

    const onAddRule = () => {
      field.push({});
      setVisible(true);
      setIsEditing(false);
      setCurrentIndex(field.value.length - 1);
    };

    const onOk = async () => {
      await field.validate();
      setVisible(false);
    };

    const onClose = () => {
      if (isEditing) {
        field.setValue(previousValue!);
      } else {
        setCurrentIndex(-1);
        field.remove(currentIndex);
      }
      setVisible(false);
    };

    const actions = {
      render: (_record: unknown, index: number) => {
        return [
          {
            title: i18n.s('edit'),
            onClick: () => {
              setPreviousValue(toJS(field.value));
              setVisible(true);
              setIsEditing(true);
              setCurrentIndex(index);
            },
          },
          {
            title: i18n.s('delete'),
            onClick: () => {
              field.remove(index);
              setCurrentIndex(-1);
              setDataSource();
            },
          },
        ];
      },
    };

    const btnDisabled = currentTypes.length === 3;
    return (
      <div>
        <Button type="ghost" onClick={onAddRule} className="mb-4" disabled={btnDisabled}>
          {i18n.s('Add trigger', 'dop')}
        </Button>
        {btnDisabled && (
          <Tooltip title={i18n.s('All trigger types are appended', 'dop')}>
            <ErdaIcon type="info" className="ml-2" />
          </Tooltip>
        )}
        <Table
          rowKey="index"
          columns={columns}
          dataSource={tableDataSource}
          extraConfig={{ hideHeader: true, hideColumnConfig: true }}
          actions={actions}
          pagination={false}
        />
        {currentIndex !== -1 && (
          <Modal
            visible={visible}
            onCancel={onClose}
            onOk={onOk}
            closable={false}
            title={isEditing ? i18n.s('Edit trigger', 'dop') : i18n.s('Create trigger', 'dop')}
          >
            <RecursionField schema={schema.items as Schema} name={currentIndex} />
          </Modal>
        )}
      </div>
    );
  },
);

const ReplicaCount = observer(() => {
  const { properties } = useFieldSchema();

  return (
    <>
      <div className="mt-4 mb-2">{i18n.s('Number of service instances', 'dop')}</div>
      <div className="flex items-center replicas-count mb-8">
        <div className="w-32">
          <RecursionField schema={properties?.minReplicaCount as Schema} name="minReplicaCount" />
        </div>
        <div className="leading-[30px] px-2">{i18n.s('to')}</div>
        <div className="w-32">
          <RecursionField schema={properties?.maxReplicaCount as Schema} name="maxReplicaCount" />
        </div>
      </div>
    </>
  );
});

const ElasticScaling = ({ visible, onClose, serviceName }: IProps) => {
  const { runtimeId } = routeInfoStore.useStore((s) => s.params);
  const scaledRules = getScaledRules.useData();
  const [started, setStarted] = React.useState(false);

  const isEditing = React.useMemo(() => !!scaledRules && !!scaledRules.rules.length, [scaledRules]);

  React.useEffect(() => {
    if (visible) {
      getScaledRules.fetch({ runtimeId: +runtimeId, services: serviceName });
    }
  }, [visible]);

  React.useEffect(() => {
    if (scaledRules && scaledRules.rules.length) {
      setStarted(scaledRules.rules[0].isApplied === 'Y');
    }
  }, [scaledRules]);

  const form = React.useMemo(() => {
    if (visible) {
      return createForm({
        effects: () => {
          onFieldReact('triggers.*.type', (field) => {
            if (isField(field)) {
              const { value } = field;
              const metadataPath = field.address.pop().concat('metadata.layout.grid');
              const valueField = field.query(metadataPath.concat('value')).take();
              const startField = field.query(metadataPath.concat('start')).take();
              const endField = field.query(metadataPath.concat('end')).take();
              const desiredReplicasField = field.query(metadataPath.concat('desiredReplicas')).take();
              const subTypePathField = field.query(metadataPath.concat('type')).take();
              const timezoneField = field.query(metadataPath.concat('timezone')).take();
              if (!value) {
                valueField?.setDisplay('none');
                startField?.setDisplay('none');
                endField?.setDisplay('none');
                desiredReplicasField?.setDisplay('none');
              } else if (value !== 'cron') {
                valueField?.setDisplay('visible');
                startField?.setDisplay('none');
                endField?.setDisplay('none');
                desiredReplicasField?.setDisplay('none');
                subTypePathField?.setDisplay('hidden');
                isField(subTypePathField) && subTypePathField?.setValue('Utilization');
                timezoneField?.setDisplay('none');
              } else {
                valueField?.setDisplay('none');
                startField?.setDisplay('visible');
                endField?.setDisplay('visible');
                desiredReplicasField?.setDisplay('visible');
                subTypePathField?.setDisplay('none');
                timezoneField?.setDisplay('hidden');
                isField(timezoneField) && timezoneField?.setValue('Asia/Shanghai');
              }
            }
          });
          onFieldValueChange('triggers.*.*.value', (field) => {
            // @ts-ignore TODO
            field.setValue(isNumber(field.value) ? `${field.value}` : field.value);
          });
          onFieldValueChange('triggers.*.*.desiredReplicas', (field) => {
            // @ts-ignore TODO
            field.setValue(isNumber(field.value) ? `${field.value}` : field.value);
          });
        },
      });
    }
    return createForm();
  }, [visible]);

  React.useEffect(() => {
    if (scaledRules && scaledRules.rules.length) {
      const { rules } = scaledRules;
      const { scaledConfig } = rules[0];
      const values = pick(scaledConfig, ['maxReplicaCount', 'minReplicaCount', 'triggers']);
      values.triggers = map(values.triggers, (trigger) => pick(trigger, ['metadata', 'type']));
      form.setValues(values);
    }
  }, [scaledRules]);

  const fieldsConfig = createFields([
    {
      component: TriggersConfig,
      name: 'triggers',
      type: 'array',
      validator: [
        {
          required: true,
          message: i18n.s('At least one trigger', 'dop'),
        },
      ],
      items: [
        {
          component: Select,
          name: 'type',
          title: i18n.s('type'),
          required: true,
        },
        {
          type: 'object',
          name: 'metadata',
          component: undefined,
          properties: [
            {
              name: 'type',
              component: undefined,
              display: 'none',
              defaultValue: 'Utilization',
            },
            {
              name: 'timezone',
              component: undefined,
              display: 'none',
              defaultValue: 'Asia/Shanghai',
            },
            {
              name: 'value',
              component: InputNumber,
              title: i18n.s('target value', 'dop'),
              required: true,
              display: 'none',
              customProps: {
                min: 0,
                max: 100,
              },
              validator: {
                validator: (v: string) => +v > 0 && +v < 100,
                message: i18n.s('The value must be greater than 0 and less than 100', 'dop'),
              },
            },
            {
              name: 'start',
              component: Input,
              title: i18n.s('start'),
              required: true,
              display: 'none',
              customProps: {
                placeholder: `${i18n.s('Please enter a cron expression, e.g.')} 30 * * * *`,
              },
            },
            {
              name: 'end',
              component: Input,
              title: i18n.s('end'),
              required: true,
              display: 'none',
              customProps: {
                placeholder: `${i18n.s('Please enter a cron expression, e.g.')} 45 * * * *`,
              },
            },
            {
              name: 'desiredReplicas',
              component: InputNumber,
              title: i18n.s('Number of service instances expand to', 'dop'),
              required: true,
              display: 'none',
            },
          ],
        },
      ],
    },
    {
      component: ReplicaCount,
      type: 'void',
      name: 'void',
      title: i18n.s('Expansion and shrinkage range', 'dop'),
      noPropertyLayoutWrapper: true,
      properties: [
        {
          name: 'minReplicaCount',
          component: InputNumber,
          wrapperProps: {
            feedbackLayout: 'none',
          },
          validator: [
            {
              required: true,
              message: i18n.s('The minimum number of service instances is required', 'dop'),
            },
          ],
          customProps: {
            placeholder: i18n.s('minimum'),
            min: 0,
            max: 100,
          },
        },
        {
          name: 'maxReplicaCount',
          component: InputNumber,
          required: true,
          wrapperProps: {
            feedbackLayout: 'none',
          },
          validator: [
            {
              required: true,
              message: i18n.s('The maximum number of service instances is required', 'dop'),
            },
          ],
          customProps: {
            placeholder: i18n.s('maximum'),
            min: 1,
            max: 100,
          },
        },
      ],
    },
  ]);

  const onSubmit = async () => {
    try {
      await form.validate();
    } catch (errs) {
      forEach(errs as IFormFeedback[], (err) => {
        message.error(err?.messages?.join(', '));
      });
      return;
    }
    const values = toJS(form.values) as RUNTIME.ScaledConfig;
    values.triggers = values.triggers.filter(({ type }) => !!type);
    if (isEditing) {
      await updateScaledRules({
        runtimeId: +runtimeId,
        rules: [
          {
            ruleId: scaledRules?.rules[0].ruleId!,
            scaledConfig: values,
          },
        ],
        $options: { successMsg: i18n.s('update successfully') },
      });
    } else {
      await createScaledRules({
        runtimeId: +runtimeId,
        services: [
          {
            serviceName,
            scaledConfig: values,
          },
        ],
        $options: { successMsg: i18n.s('create successfully') },
      });
    }
    onClose();
  };

  return (
    <Drawer
      width={800}
      visible={visible}
      title={
        <StatusTitle
          runtimeId={+runtimeId}
          ruleId={scaledRules ? scaledRules?.rules[0]?.ruleId : null}
          started={started}
          toggleStatus={() => setStarted(!started)}
        />
      }
      bodyStyle={{ display: 'flex', flexDirection: 'column' }}
      onClose={onClose}
      destroyOnClose
    >
      <div className="flex flex-col justify-between flex-1">
        <Form form={form} fieldsConfig={fieldsConfig} />
        <div className="flex justify-end items-center">
          <Button onClick={onSubmit} className="mr-2" type="primary">
            {i18n.s('save')}
          </Button>
          <Button onClick={onClose}>{i18n.s('close')}</Button>
        </div>
      </div>
    </Drawer>
  );
};

export default ElasticScaling;