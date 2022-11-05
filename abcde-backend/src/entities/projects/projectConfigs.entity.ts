import { Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core';
import { ProjectConfigsRepository } from '../../projects/projectConfigs.repository';
import { SectionChildrenIds } from '../sections/sectionChildrenIds.entity';
import { SectionConfigColsIds } from '../sections/sectionConfigColsIds.entity';
import { Projects } from './projects.entity';

// A project is a collection of sections, settings, module collections etc.
@Entity({ customRepository: () => ProjectConfigsRepository })
export class ProjectConfigs {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuid_generate_v4()' })
  id: string;

  @Property()
  name: string;

  @ManyToOne(() => Projects, { nullable: true })
  project: Projects;

  @ManyToOne()
  sectionConfigCol: SectionConfigColsIds;

  @ManyToOne()
  children: SectionChildrenIds;
}
