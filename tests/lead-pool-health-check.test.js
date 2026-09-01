const assert = require('assert');

const { buildLeadPoolHealthReport } = require('../scripts/lead-pool-health-check.js');

function healthyPayload() {
  return {
    leadRows: [
      {
        id: 'lead-one1',
        displayName: 'one1',
        leadDate: '2026-08-01',
        firstTouchAt: '2026-08-01',
        createdAt: '2026-08-01',
        leadDateSource: 'manual'
      }
    ],
    leadSummary: {
      total: 1,
      historicalStudents: 1,
      activeStudents: 1,
      trialAttended: 1,
      trialAttendedToFormalPurchase: 1
    },
    customerCenterPayload: {
      teachingStudentViews: {
        summary: {
          historicalStudentCount: 1,
          activeStudentCount: 1,
          trialAttendedStudentCount: 1,
          trialAttendedToFormalPurchaseCount: 1
        }
      },
      standardLifecycleMetrics: {
        teachingSummary: {
          historicalStudentCount: 1,
          activeStudentCount: 1,
          trialAttendedStudentCount: 1,
          trialAttendedToFormalPurchaseCount: 1
        }
      }
    },
    lifecyclePayload: {
      teachingStudentViews: {
        summary: {
          historicalStudentCount: 1,
          activeStudentCount: 1,
          trialAttendedStudentCount: 1,
          trialAttendedToFormalPurchaseCount: 1
        }
      },
      standardLifecycleMetrics: {
        teachingSummary: {
          historicalStudentCount: 1,
          activeStudentCount: 1,
          trialAttendedStudentCount: 1,
          trialAttendedToFormalPurchaseCount: 1
        }
      }
    }
  };
}

function dirtyPayload() {
  return {
    leadRows: [
      {
        id: 'lead-one1-a',
        displayName: 'one1',
        leadDate: '2026-08-01',
        firstTouchAt: '2026-08-01',
        createdAt: '2026-08-01',
        leadDateSource: 'manual'
      },
      {
        id: 'lead-one1-b',
        displayName: 'one1',
        leadDate: '2026-08-02',
        firstTouchAt: '2026-08-01',
        createdAt: '2026-08-02',
        leadDateSource: 'system'
      },
      {
        id: 'lead-dirty',
        displayName: '拾柒.🦄（2人）、揭彬',
        leadDate: '',
        firstTouchAt: '',
        createdAt: '2026-08-03',
        leadDateSource: 'system'
      }
    ],
    leadSummary: {
      total: 3,
      historicalStudents: 2,
      activeStudents: 1,
      trialAttended: 1,
      trialAttendedToFormalPurchase: 0
    },
    customerCenterPayload: {
      teachingStudentViews: {
        summary: {
          historicalStudentCount: 2,
          activeStudentCount: 1,
          trialAttendedStudentCount: 1,
          trialAttendedToFormalPurchaseCount: 0
        }
      },
      standardLifecycleMetrics: {
        teachingSummary: {
          historicalStudentCount: 2,
          activeStudentCount: 1,
          trialAttendedStudentCount: 1,
          trialAttendedToFormalPurchaseCount: 0
        }
      }
    },
    lifecyclePayload: {
      teachingStudentViews: {
        summary: {
          historicalStudentCount: 3,
          activeStudentCount: 1,
          trialAttendedStudentCount: 1,
          trialAttendedToFormalPurchaseCount: 0
        }
      },
      standardLifecycleMetrics: {
        teachingSummary: {
          historicalStudentCount: 3,
          activeStudentCount: 1,
          trialAttendedStudentCount: 1,
          trialAttendedToFormalPurchaseCount: 0
        }
      }
    }
  };
}

(() => {
  const healthy = buildLeadPoolHealthReport(healthyPayload());
  assert.strictEqual(healthy.ok, true, '健康样本必须通过');
  assert.deepStrictEqual(healthy.issues, [], '健康样本不应产生问题');

  const dirty = buildLeadPoolHealthReport(dirtyPayload());
  assert.strictEqual(dirty.ok, false, '脏样本必须失败');
  assert.ok(dirty.issues.some(text => /重复线索/.test(text)), '必须抓到重复线索');
  assert.ok(dirty.issues.some(text => /脏名字/.test(text)), '必须抓到脏名字');
  assert.ok(dirty.issues.some(text => /线索时间不对|线索时间为空/.test(text)), '必须抓到线索时间问题');
  assert.ok(dirty.issues.some(text => /历史学员数不一致/.test(text)), '必须抓到跨页历史学员数不一致');

  console.log('lead pool health check tests passed');
})();
